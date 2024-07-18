/**
 * @license
 * Copyright 2024 SageMath, Inc.
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
import { Loader } from "./amd";
import type {
  WidgetManager,
  WidgetEnvironment,
  ModelState,
} from "./api";
import { Manager, is_unpack_models } from "./manager";
import type { IClassicComm } from "@jupyter-widgets/base";

export type {
  IClassicComm,
  ModelState,
  WidgetEnvironment,
  WidgetManager,
};

export { is_unpack_models };

/**
 * Implementation of the WidgetManagerModule interface.
 */
export function createWidgetManager(
  environment: WidgetEnvironment,
): WidgetManager {
  const loader = new Loader();
  return new Manager(environment, loader);
}
