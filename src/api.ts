/**
 * @license
 * Copyright 2024 SageMath Inc
 * Copyright 2021 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { IClassicComm } from "@jupyter-widgets/base";

/**
 * The interface a custom widget manager ES6 module is expected to implement.
 */

/**
 * The host API of the widget manager.
 */
export interface WidgetEnvironment {
  /**
   * @param modelId The ID of the model for which the model state is desired.
   */
  getModelState(modelId: string): Promise<ModelState | undefined>;

  /**
   * Open a new comm channel to the kernel.
   *
   * The kernel should have registered a handler following the documentation
   * at
   * https://jupyter-notebook.readthedocs.io/en/stable/comms.html#opening-a-comm-from-the-frontend.
   *
   * @return The established comm channel.
   */
  openCommChannel(opts: {
    // The name of the channel registered on the kernel.
    target_name: string;
    // The id of the comm (this is the model_id)
    comm_id: string;
    // Any data to be sent with the open message.
    data?: unknown;
    metadata?: unknown;
    // Any binary data to be sent with the open message.
    buffers?: ArrayBuffer[];
  }): Promise<IClassicComm>;

  // Renders a standard Jupyter output item into destination.
  renderOutput(outputItem: unknown, destination: Element): Promise<void>;

  // return a class to use that; return null to fallback to what is builtin or the cdn.
  loadClass(
    className: string,
    moduleName: string,
    moduleVersion: string,
  ): Promise<any>;
}

export interface WidgetManager {
  /**
   * Render the model specified by modelId into the container element.
   */
  render(modelId: string, container: Element): Promise<void>;
}

export interface ModelState {
  modelName: string;
  modelModule: string;
  modelModuleVersion: string;

  state: { [key: string]: unknown };
}
