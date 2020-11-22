import { getCurrentElement, mount, nextTick } from '@hopejs/runtime-core';
import { reactive } from '@vue/reactivity';
import {
  $div,
  block,
  defineComponent,
  div,
  hClass,
  onUnmounted,
  onUpdated,
  style,
} from '../src';

describe('style', () => {
  it('reactivity', async () => {
    let el: Element;
    const state = reactive({ width: 100 });
    const [com, $com] = defineComponent(() => {
      style(() => `.container { width: ${state.width}px; height: 100px; }`);

      div();
      hClass('container');
      el = getCurrentElement()!;
      $div();
    });

    com();
    $com();
    mount(document.body);
    const styleEl = document.querySelector('style');
    // @ts-ignore
    expect(el.outerHTML).toBe(`<div class="container" h-sid-1=""></div>`);
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-sid-1]{ width: 100px; height: 100px; }</style>`
    );
    state.width = 200;
    await nextTick();
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-sid-1]{ width: 200px; height: 100px; }</style>`
    );
  });

  it('basic', () => {
    let el: Element;
    const [com, $com] = defineComponent(() => {
      style(`.container { width: 100px; height: 100px; }`);

      div();
      el = getCurrentElement()!;
      $div();
    });

    com();
    $com();
    mount(document.body);
    const styleEl = document.querySelector('style');
    // @ts-ignore
    expect(el.outerHTML).toBe(`<div h-cid-2=""></div>`);
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-sid-1]{ width: 200px; height: 100px; }.container[h-cid-2]{ width: 100px; height: 100px; }</style>`
    );
  });

  it('with block', async () => {
    let el: Element;
    const unmounted = jest.fn();
    const updated = jest.fn();
    const state = reactive({ width: 100, show: true });
    const [com, $com] = defineComponent(() => {
      style(() => `.container { width: ${state.width}px; height: 100px; }`);

      onUnmounted(unmounted);
      onUpdated(updated);

      div();
      hClass('container');
      el = getCurrentElement()!;
      $div();
    });

    const styleEl = document.querySelector('style');
    // 清空之前的样式信息
    styleEl && (styleEl.innerHTML = '');

    block(() => {
      if (state.show) {
        com();
        $com();
      }
    });
    mount(document.body);
    // @ts-ignore
    expect(el.outerHTML).toBe(`<div class="container" h-sid-3=""></div>`);
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-sid-3]{ width: 100px; height: 100px; }</style>`
    );
    expect(updated).toBeCalledTimes(1);

    state.width = 200;
    await nextTick();
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-sid-3]{ width: 200px; height: 100px; }</style>`
    );
    expect(updated).toBeCalledTimes(2);

    state.show = false;
    await nextTick();
    expect(unmounted).toBeCalledTimes(1);
    expect(styleEl?.outerHTML).toBe(`<style></style>`);

    state.width = 300;
    await nextTick();
    expect(updated).toBeCalledTimes(2);
    expect(styleEl?.outerHTML).toBe(`<style></style>`);
    expect(unmounted).toBeCalledTimes(1);
  });

  it('end', () => {
    let el: Element;
    const [com, $com] = defineComponent(() => {
      div();
      el = getCurrentElement()!;
      $div();

      style(`.container { width: 100px; height: 100px; }`);
    });

    com();
    $com();
    mount(document.body);
    const styleEl = document.querySelector('style');
    // @ts-ignore
    expect(el.outerHTML).toBe(`<div h-cid-4=""></div>`);
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-cid-4]{ width: 100px; height: 100px; }</style>`
    );
  });

  it('end & reactivity', async () => {
    let el: Element;
    const state = reactive({ width: 100 });
    const [com, $com] = defineComponent(() => {
      div();
      el = getCurrentElement()!;
      $div();

      style(() => `.container { width: ${state.width}px; height: 100px; }`);
    });

    com();
    $com();
    mount(document.body);
    const styleEl = document.querySelector('style');
    // @ts-ignore
    expect(el.outerHTML).toBe(`<div h-sid-5=""></div>`);
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-cid-4]{ width: 100px; height: 100px; }.container[h-sid-5]{ width: 100px; height: 100px; }</style>`
    );

    state.width = 200;
    await nextTick();
    expect(styleEl?.outerHTML).toBe(
      `<style>.container[h-cid-4]{ width: 100px; height: 100px; }.container[h-sid-5]{ width: 200px; height: 100px; }</style>`
    );
  });
});
