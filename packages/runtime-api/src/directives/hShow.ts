import {
  appendChild,
  createElement,
  createPlaceholder,
  insertBefore,
  removeChild,
} from "@hopejs/renderer";
import { getCurrentElement } from "@hopejs/runtime-core";
import { isFunction } from "@hopejs/shared";
import { effect } from "@hopejs/reactivity";
import { outsideWarn } from "./outsideWarn";
import { callUpdated, getLifecycleHandlers } from "../lifecycle";

export function hShow(value: any | (() => any)) {
  // TODO: 该指令不允许在组件中使用

  const currentElement = getCurrentElement();
  const cache = createElement("div");
  const placeholder = createPlaceholder("hShow");
  if (currentElement) {
    if (isFunction(value)) {
      const { updatedHandlers } = getLifecycleHandlers()!;
      effect(() => {
        if (value()) {
          showElement(currentElement, cache, placeholder);
        } else {
          hideElement(currentElement, cache, placeholder);
        }
        updatedHandlers && callUpdated(updatedHandlers);
      });
    } else {
      if (value) {
        showElement(currentElement, cache, placeholder);
      } else {
        hideElement(currentElement, cache, placeholder);
      }
    }
  } else {
    outsideWarn("hShow");
  }
}

function hideElement(
  el: Element,
  cache: Element,
  placeholder: Element | Comment
) {
  insertBefore(placeholder, el);
  appendChild(cache, el);
}

function showElement(
  el: Element,
  cache: Element,
  placeholder: Element | Comment
) {
  if (!cache.childNodes.length) return;
  insertBefore(el, placeholder);
  removeChild(placeholder);
}
