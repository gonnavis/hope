import { createElement, createFragment, appendChild } from "@hopejs/renderer";

/**
 * 标签元素中的静态属性参数
 */
export type StaticAttr = Record<string, string>;

let currentElement: Element | undefined;
const elementStack: Element[] = [];

// 用于存储生成的元素，最终添加到 DOM 树中
const fragment = createFragment();
let blockFragment: DocumentFragment | null = null;

export function start<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attr?: StaticAttr
): void;
/** @deprecated */
export function start<K extends keyof HTMLElementDeprecatedTagNameMap>(
  tag: K,
  attr?: StaticAttr
): void;
export function start<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attr?: StaticAttr
): void;
export function start(tag: string, attr?: StaticAttr): void {
  currentElement = createElement(tag);
  appendElement();
  elementStack.push(currentElement);
}

export function end() {
  elementStack.pop();
  currentElement = getLastElement();
}

export function mount(container: Element) {
  container.innerHTML = "";
  appendChild(container, fragment);
}

export function getCurrentElement() {
  return currentElement;
}

export function createBlockFragment() {
  return createFragment();
}

export function setBlockFragment(value: DocumentFragment) {
  blockFragment = value;
}

export function resetBlockFragment() {
  blockFragment = null;
}

export function getFragment() {
  return fragment;
}

function appendElement() {
  if (!currentElement) return;
  if (blockFragment) {
    appendChild(blockFragment, currentElement);
    return;
  }
  if (!elementStack.length) {
    appendChild(fragment, currentElement);
  } else {
    appendChild(getLastElement(), currentElement);
  }
}

function getLastElement() {
  return elementStack[elementStack.length - 1];
}
