/**
 * @license
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
import { WidgetManager, WidgetEnvironment } from "./api";
import * as outputs from "./outputs";
import { swizzle } from "./swizzle";
import {
  WidgetModel,
  WidgetView,
  IClassicComm,
  DOMWidgetView,
  remove_buffers,
  put_buffers,
  Dict,
  unpack_models,
} from "@jupyter-widgets/base";
import type { BufferJSON } from "./utils";
import * as base from "@jupyter-widgets/base";
import { ManagerBase } from "@jupyter-widgets/base-manager";
import * as controls from "@jupyter-widgets/controls";
import * as services from "@jupyterlab/services";
import { JSONObject } from "@lumino/coreutils";
import { Message } from "@lumino/messaging";
import { Widget } from "@lumino/widgets";

export type { WidgetEnvironment };

export class Manager extends ManagerBase implements WidgetManager {
  private readonly models = new Map<string, Promise<WidgetModel>>();
  private readonly loader: Loader;

  constructor(
    private readonly environment: WidgetEnvironment,
    loader: Loader,
  ) {
    super();

    this.loader = loader;

    // Backbone's extend cannot iterate static properties on ES6 classes and
    // misses propagating them when subclassing.
    const backboneExtend = base.WidgetModel.extend;
    const extend = function (
      this: object,
      proto: object,
      statics: unknown,
    ): any {
      const result = backboneExtend.call(this, proto, statics);
      // Use prototype inheritance of the classes so the statics are correctly
      // inherited.
      Object.setPrototypeOf(result, this);
      return result;
    };
    base.WidgetModel.extend = controls.ButtonModel.extend = extend;

    // https://github.com/googlecolab/colab-cdn-widget-manager/issues/12
    // Add pWidget for better compat with jupyter-widgets 4.0.0.
    if (!Object.getOwnPropertyDescriptor(DOMWidgetView.prototype, "pWidget")) {
      Object.defineProperty(DOMWidgetView.prototype, "pWidget", {
        get: function () {
          return this.luminoWidget;
        },
      });
    }

    // https://github.com/googlecolab/colab-cdn-widget-manager/issues/19
    // Add processPhosphorMessage for better compat with jupyter-widgets 4.0.0.
    if (
      !Object.getOwnPropertyDescriptor(
        DOMWidgetView.prototype,
        "processPhosphorMessage",
      )
    ) {
      Object.defineProperty(DOMWidgetView.prototype, "processPhosphorMessage", {
        value: function () {},
        writable: true,
      });
    }

    this.loader.define("@jupyter-widgets/base", [], () => {
      const module: { [key: string]: unknown } = {};
      for (const key of Object.keys(base)) {
        let value = (base as any)[key];
        // The ES6 classes cannot be subclassed via Backbone's extend that some
        // code uses, so if the export looks like a class use swizzle to make it
        // extensible.
        if (isES6Class(value)) {
          value = swizzle(value);
        }
        module[key] = value;
      }
      return module;
    });

    this.loader.define("@jupyter-widgets/controls", [], () => {
      const module: { [key: string]: unknown } = {};
      for (const key of Object.keys(controls)) {
        let value = (controls as any)[key];
        // The ES6 classes cannot be subclassed via Backbone's extend that some
        // code uses, so if the export looks like a class use swizzle to make it
        // extensible.
        if (isES6Class(value)) {
          value = swizzle(value);
        }
        module[key] = value;
      }
      return module;
    });

    this.loader.define("@jupyter-widgets/output", [], () => outputs);
  }

  protected async loadClass(
    className: string,
    moduleName: string,
    moduleVersion: string,
  ): Promise<typeof WidgetModel | typeof WidgetView> {
    const cls = await this.environment.loadClass?.(
      className,
      moduleName,
      moduleVersion,
    );
    if (cls != null) {
      return cls;
    }
    const exports = await this.loader.load(moduleName, moduleVersion);
    return (
      exports as { [key: string]: typeof WidgetModel | typeof WidgetView }
    )[className];
  }

  protected async _create_comm(
    comm_target_name: string,
    model_id?: string,
    data?: JSONObject,
    metadata?: JSONObject,
    buffers?: ArrayBuffer[] | ArrayBufferView[],
  ): Promise<IClassicComm> {
    const sendBuffers = buffers?.map((buffer) => {
      if (ArrayBuffer.isView(buffer)) {
        return new Uint8Array(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        );
      }
      return buffer;
    });
    return await this.environment.openCommChannel({
      target_name: comm_target_name,
      comm_id: model_id ?? "",
      data,
      metadata,
      buffers: sendBuffers,
    });
  }

  protected _get_comm_info(): Promise<{}> {
    throw new Error("Method not implemented.");
  }

  async get_model(modelId: string): Promise<WidgetModel> {
    let modelPromise = this.models.get(modelId);
    if (modelPromise) {
      return modelPromise;
    }
    modelPromise = (async () => {
      const state = await this.environment.getModelState(modelId);
      if (!state) {
        throw new Error("not found");
      }

      // Round-trip the state through Jupyter's remove_buffers/put_buffers to
      // normalize the buffer format.
      const serializedState = remove_buffers(state.state as BufferJSON);
      put_buffers(
        state.state as Dict<BufferJSON>,
        serializedState.buffer_paths,
        serializedState.buffers,
      );

      const model = await this.new_model(
        {
          model_name: state.modelName,
          model_module: state.modelModule,
          model_module_version: state.modelModuleVersion,
          model_id: modelId,
        },
        state.state,
      );
      return model;
    })();
    this.models.set(modelId, modelPromise);
    if (modelPromise == null) {
      throw Error("bug");
    }
    return modelPromise;
  }

  async render(modelId: string, container: HTMLElement): Promise<void> {
    const model = (await this.get_model(modelId)) as WidgetModel;
    const view = await this.create_view(model);
    // @ts-ignore
    dispatchLuminoMessage(view.luminoWidget, {
      type: "before-attach",
      isConflatable: false,
      conflate: () => false,
    });

    // @ts-ignore
    const lifecycleAdapter = new LuminoLifecycleAdapter(view.luminoWidget);
    lifecycleAdapter.appendChild(view.el);
    container.appendChild(lifecycleAdapter);
  }

  // TODO: this is here for now because the code to make the ErrorWidget
  // in the base class (upstream) just
  // doesn't work for me, but I still need to see the error. This is copied
  // from the ipywidgets source code, with the only real changes:
  // (1) adding "e" to then console error message, AND
  // (2) changing the constructor call for ModelCls to have empty args.
  // This *might* be a bug in the latest upstream, which would be weird.
  // In any case, for now this workaround seems to work perfectly.
  create_view(model: any, options = {}) {
    const id = base.uuid();
    const viewPromise = (model.state_change = model.state_change.then(
      async () => {
        const _view_name = model.get("_view_name");
        const _view_module = model.get("_view_module");
        try {
          const ViewType = (await this.loadViewClass(
            _view_name,
            _view_module,
            model.get("_view_module_version"),
          )) as typeof DOMWidgetView;
          const view = new ViewType({
            model: model,
            options: this.setViewOptions(options),
          });
          view.listenTo(model, "destroy", view.remove);
          await view.render();

          // This presumes the view is added to the list of model views below
          view.once("remove", () => {
            if (model.views) {
              delete model.views[id];
            }
          });

          return view;
        } catch (e) {
          // the code below for making the error widget weirdly doesn't work,
          // which makes it impossible to know what e is!
          console.error(
            `Could not create a view for model id ${model.model_id}`,
            e,
          );
          const msg = `Failed to create view for '${_view_name}' from module '${_view_module}' with model '${model.name}' from module '${model.module}'`;
          const ModelCls = base.createErrorWidgetModel(e as any, msg);
          const errorModel = new ModelCls({}, {});
          const view = new base.ErrorWidgetView({
            model: errorModel,
            options: this.setViewOptions(options),
          });
          await view.render();

          return view;
        }
      },
    ));
    if (model.views) {
      model.views[id] = viewPromise;
    }
    return viewPromise;
  }

  renderOutput(outputItem: unknown, destination: Element): Promise<void> {
    return this.environment.renderOutput(outputItem, destination);
  }
}

function isES6Class(value: unknown): boolean {
  return typeof value === "function" && value.toString().startsWith("class ");
}

/**
 * Custom element to provide Lumino lifecycle events driven by native DOM
 * events.
 */
class LuminoLifecycleAdapter extends HTMLElement {
  constructor(private readonly widget?: Widget) {
    super();
  }
  connectedCallback() {
    if (this.widget) {
      dispatchLuminoMessage(this.widget, {
        type: "after-attach",
        isConflatable: false,
        conflate: () => false,
      });
    }
  }
  disconnectedCallback() {
    if (this.widget) {
      // We don't have a native event for before-detach, so just fire before
      // the after-detach.
      dispatchLuminoMessage(this.widget, {
        type: "before-detach",
        isConflatable: false,
        conflate: () => false,
      });
      dispatchLuminoMessage(this.widget, {
        type: "after-detach",
        isConflatable: false,
        conflate: () => false,
      });
    }
  }
}

function dispatchLuminoMessage(widget: Widget, message: Message) {
  widget.processMessage(message);
  const phosphorWidget = widget as MaybePhosphorWidget;
  if (phosphorWidget._view?.processPhosphorMessage) {
    phosphorWidget._view.processPhosphorMessage(message);
  }
}

export function is_unpack_models(f: Function) {
  return f == unpack_models;
}

declare interface MaybePhosphorWidget {
  _view?: MaybePhosphorView;
}

declare interface MaybePhosphorView {
  processPhosphorMessage?(message: Message): void;
}

try {
  window.customElements.define("colab-lumino-adapter", LuminoLifecycleAdapter);
} catch (error: unknown) {
  // May have already been defined.
}
