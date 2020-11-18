import { reactive } from "@hopejs/reactivity";
import { getCurrentElement } from "@hopejs/runtime-core";
import {
  $div,
  defineComponent,
  div,
  hProp,
  hText,
  hSlot,
  mount,
  hOn,
  block,
} from "../src";

describe("defineComponent", () => {
  it("basic", () => {
    const [helloWorld, $helloWorld] = defineComponent(() => {
      div();
      hText("Hello World");
      $div();
    });

    const container = document.createElement("div");
    helloWorld();
    $helloWorld();
    mount(container);
    expect(container.innerHTML).toBe(
      `<!--component start--><div>Hello World</div><!--component end-->`
    );
  });

  it("mount", () => {
    const HelloWorld = defineComponent(() => {
      div();
      hText("Hello Hope");
      $div();
    });

    const container = document.createElement("div");
    HelloWorld.mount(container);
    expect(container.innerHTML).toBe(
      `<!--component start--><div>Hello Hope</div><!--component end-->`
    );
  });

  it("props", () => {
    const p = reactive({ name: "a" });
    const [person, $person] = defineComponent<any, any>(({ props }) => {
      div();
      hText(() => props.name);
      $div();
    });

    person();
    hProp("name", () => p.name);
    $person();

    const container = document.createElement("div");
    mount(container);
    expect(container.innerHTML).toBe(
      `<!--component start--><div>a</div><!--component end-->`
    );

    p.name = "b";
    expect(container.innerHTML).toBe(
      `<!--component start--><div>b</div><!--component end-->`
    );
  });

  it("slots", () => {
    const [person, $person] = defineComponent<any, any>(({ slots }) => {
      div();
      slots.default();
      $div();
    });

    person();
    hSlot("default", () => {
      div();
      $div();
    });
    $person();

    const container = document.createElement("div");
    mount(container);
    expect(container.innerHTML).toBe(
      `<!--component start--><div><div></div></div><!--component end-->`
    );
  });

  it("emit", () => {
    let el: Element;
    const [person, $person] = defineComponent<any, any>(({ emit }) => {
      div();
      hOn("click", () => {
        emit && emit("testClick", 123);
      });
      el = getCurrentElement()!;
      $div();
    });

    const fn = jest.fn((arg) => {
      expect(arg).toBe(123);
    });

    person();
    hOn("testClick", fn);
    $person();

    const container = document.createElement("div");
    mount(container);

    // @ts-ignore
    el.dispatchEvent(new CustomEvent("click"));
    expect(fn).toBeCalledTimes(1);
  });

  it("lifecycle", () => {});

  it("block & component", () => {
    const [com, $com] = defineComponent<any, any>(({ props }) => {
      div();
      hText(() => props.a);
      $div();
    });
    block(() => {
      div();
      $div();
      com();
      hProp("a", () => "b");
      $com();
    });
    const container = document.createElement("div");
    mount(container);
    expect(container.innerHTML).toBe(
      `<!--block start--><div></div><!--component start--><div>b</div><!--component end--><!--block end-->`
    );
  });
});
