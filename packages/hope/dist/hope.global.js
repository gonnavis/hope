var Hope = (function (exports) {
    'use strict';

    /**
     * Make a map and return a function for checking if a key
     * is in that map.
     * IMPORTANT: all calls of this function must be prefixed with
     * \/\*#\_\_PURE\_\_\*\/
     * So that rollup can tree-shake them if necessary.
     */
    function makeMap(str, expectsLowerCase) {
        const map = Object.create(null);
        const list = str.split(',');
        for (let i = 0; i < list.length; i++) {
            map[list[i]] = true;
        }
        return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val];
    }
    /**
     * CSS properties that accept plain numbers
     */
    const isNoUnitNumericStyleProp = /*#__PURE__*/ makeMap(`animation-iteration-count,border-image-outset,border-image-slice,` +
        `border-image-width,box-flex,box-flex-group,box-ordinal-group,column-count,` +
        `columns,flex,flex-grow,flex-positive,flex-shrink,flex-negative,flex-order,` +
        `grid-row,grid-row-end,grid-row-span,grid-row-start,grid-column,` +
        `grid-column-end,grid-column-span,grid-column-start,font-weight,line-clamp,` +
        `line-height,opacity,order,orphans,tab-size,widows,z-index,zoom,` +
        // SVG
        `fill-opacity,flood-opacity,stop-opacity,stroke-dasharray,stroke-dashoffset,` +
        `stroke-miterlimit,stroke-opacity,stroke-width`);

    function normalizeStyle(value) {
        if (isArray(value)) {
            const res = {};
            for (let i = 0; i < value.length; i++) {
                const item = value[i];
                const normalized = normalizeStyle(isString(item) ? parseStringStyle(item) : item);
                if (normalized) {
                    for (const key in normalized) {
                        res[key] = normalized[key];
                    }
                }
            }
            return res;
        }
        else if (isObject(value)) {
            return value;
        }
    }
    const listDelimiterRE = /;(?![^(]*\))/g;
    const propertyDelimiterRE = /:(.+)/;
    function parseStringStyle(cssText) {
        const ret = {};
        cssText.split(listDelimiterRE).forEach(item => {
            if (item) {
                const tmp = item.split(propertyDelimiterRE);
                tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
            }
        });
        return ret;
    }
    function stringifyStyle(styles) {
        let ret = '';
        if (!styles) {
            return ret;
        }
        for (const key in styles) {
            const value = styles[key];
            const normalizedKey = key.startsWith(`--`) ? key : hyphenate(key);
            if (isString(value) ||
                (typeof value === 'number' && isNoUnitNumericStyleProp(normalizedKey))) {
                // only render valid values
                ret += `${normalizedKey}:${value};`;
            }
        }
        return ret;
    }
    function normalizeClass(value) {
        let res = '';
        if (isString(value)) {
            res = value;
        }
        else if (isArray(value)) {
            for (let i = 0; i < value.length; i++) {
                res += normalizeClass(value[i]) + ' ';
            }
        }
        else if (isObject(value)) {
            for (const name in value) {
                if (value[name]) {
                    res += name + ' ';
                }
            }
        }
        return res.trim();
    }
    const EMPTY_OBJ =  Object.freeze({})
        ;
    const EMPTY_ARR =  Object.freeze([]) ;
    const extend = Object.assign;
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    const hasOwn = (val, key) => hasOwnProperty.call(val, key);
    const isArray = Array.isArray;
    const isMap = (val) => toTypeString(val) === '[object Map]';
    const isFunction = (val) => typeof val === 'function';
    const isString = (val) => typeof val === 'string';
    const isSymbol = (val) => typeof val === 'symbol';
    const isObject = (val) => val !== null && typeof val === 'object';
    const objectToString = Object.prototype.toString;
    const toTypeString = (value) => objectToString.call(value);
    const toRawType = (value) => {
        // extract "RawType" from strings like "[object RawType]"
        return toTypeString(value).slice(8, -1);
    };
    const isIntegerKey = (key) => isString(key) &&
        key !== 'NaN' &&
        key[0] !== '-' &&
        '' + parseInt(key, 10) === key;
    const cacheStringFunction = (fn) => {
        const cache = Object.create(null);
        return ((str) => {
            const hit = cache[str];
            return hit || (cache[str] = fn(str));
        });
    };
    const hyphenateRE = /\B([A-Z])/g;
    /**
     * @private
     */
    const hyphenate = cacheStringFunction((str) => str.replace(hyphenateRE, '-$1').toLowerCase());
    /**
     * @private
     */
    const capitalize = cacheStringFunction((str) => str.charAt(0).toUpperCase() + str.slice(1));
    // compare whether a value has changed, accounting for NaN.
    const hasChanged = (value, oldValue) => value !== oldValue && (value === value || oldValue === oldValue);

    const targetMap = new WeakMap();
    const effectStack = [];
    let activeEffect;
    const ITERATE_KEY = Symbol( 'iterate' );
    const MAP_KEY_ITERATE_KEY = Symbol( 'Map key iterate' );
    function isEffect(fn) {
        return fn && fn._isEffect === true;
    }
    function effect(fn, options = EMPTY_OBJ) {
        if (isEffect(fn)) {
            fn = fn.raw;
        }
        const effect = createReactiveEffect(fn, options);
        if (!options.lazy) {
            effect();
        }
        return effect;
    }
    function stop(effect) {
        if (effect.active) {
            cleanup(effect);
            if (effect.options.onStop) {
                effect.options.onStop();
            }
            effect.active = false;
        }
    }
    let uid = 0;
    function createReactiveEffect(fn, options) {
        const effect = function reactiveEffect() {
            if (!effect.active) {
                return options.scheduler ? undefined : fn();
            }
            if (!effectStack.includes(effect)) {
                cleanup(effect);
                try {
                    enableTracking();
                    effectStack.push(effect);
                    activeEffect = effect;
                    return fn();
                }
                finally {
                    effectStack.pop();
                    resetTracking();
                    activeEffect = effectStack[effectStack.length - 1];
                }
            }
        };
        effect.id = uid++;
        effect.allowRecurse = !!options.allowRecurse;
        effect._isEffect = true;
        effect.active = true;
        effect.raw = fn;
        effect.deps = [];
        effect.options = options;
        return effect;
    }
    function cleanup(effect) {
        const { deps } = effect;
        if (deps.length) {
            for (let i = 0; i < deps.length; i++) {
                deps[i].delete(effect);
            }
            deps.length = 0;
        }
    }
    let shouldTrack = true;
    const trackStack = [];
    function pauseTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = false;
    }
    function enableTracking() {
        trackStack.push(shouldTrack);
        shouldTrack = true;
    }
    function resetTracking() {
        const last = trackStack.pop();
        shouldTrack = last === undefined ? true : last;
    }
    function track(target, type, key) {
        if (!shouldTrack || activeEffect === undefined) {
            return;
        }
        let depsMap = targetMap.get(target);
        if (!depsMap) {
            targetMap.set(target, (depsMap = new Map()));
        }
        let dep = depsMap.get(key);
        if (!dep) {
            depsMap.set(key, (dep = new Set()));
        }
        if (!dep.has(activeEffect)) {
            dep.add(activeEffect);
            activeEffect.deps.push(dep);
            if ( activeEffect.options.onTrack) {
                activeEffect.options.onTrack({
                    effect: activeEffect,
                    target,
                    type,
                    key
                });
            }
        }
    }
    function trigger(target, type, key, newValue, oldValue, oldTarget) {
        const depsMap = targetMap.get(target);
        if (!depsMap) {
            // never been tracked
            return;
        }
        const effects = new Set();
        const add = (effectsToAdd) => {
            if (effectsToAdd) {
                effectsToAdd.forEach(effect => {
                    if (effect !== activeEffect || effect.allowRecurse) {
                        effects.add(effect);
                    }
                });
            }
        };
        if (type === "clear" /* CLEAR */) {
            // collection being cleared
            // trigger all effects for target
            depsMap.forEach(add);
        }
        else if (key === 'length' && isArray(target)) {
            depsMap.forEach((dep, key) => {
                if (key === 'length' || key >= newValue) {
                    add(dep);
                }
            });
        }
        else {
            // schedule runs for SET | ADD | DELETE
            if (key !== void 0) {
                add(depsMap.get(key));
            }
            // also run for iteration key on ADD | DELETE | Map.SET
            switch (type) {
                case "add" /* ADD */:
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    }
                    else if (isIntegerKey(key)) {
                        // new index added to array -> length changes
                        add(depsMap.get('length'));
                    }
                    break;
                case "delete" /* DELETE */:
                    if (!isArray(target)) {
                        add(depsMap.get(ITERATE_KEY));
                        if (isMap(target)) {
                            add(depsMap.get(MAP_KEY_ITERATE_KEY));
                        }
                    }
                    break;
                case "set" /* SET */:
                    if (isMap(target)) {
                        add(depsMap.get(ITERATE_KEY));
                    }
                    break;
            }
        }
        const run = (effect) => {
            if ( effect.options.onTrigger) {
                effect.options.onTrigger({
                    effect,
                    target,
                    key,
                    type,
                    newValue,
                    oldValue,
                    oldTarget
                });
            }
            if (effect.options.scheduler) {
                effect.options.scheduler(effect);
            }
            else {
                effect();
            }
        };
        effects.forEach(run);
    }

    const builtInSymbols = new Set(Object.getOwnPropertyNames(Symbol)
        .map(key => Symbol[key])
        .filter(isSymbol));
    const get = /*#__PURE__*/ createGetter();
    const shallowGet = /*#__PURE__*/ createGetter(false, true);
    const readonlyGet = /*#__PURE__*/ createGetter(true);
    const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true);
    const arrayInstrumentations = {};
    ['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function (...args) {
            const arr = toRaw(this);
            for (let i = 0, l = this.length; i < l; i++) {
                track(arr, "get" /* GET */, i + '');
            }
            // we run the method using the original args first (which may be reactive)
            const res = method.apply(arr, args);
            if (res === -1 || res === false) {
                // if that didn't work, run it again using raw values.
                return method.apply(arr, args.map(toRaw));
            }
            else {
                return res;
            }
        };
    });
    ['push', 'pop', 'shift', 'unshift', 'splice'].forEach(key => {
        const method = Array.prototype[key];
        arrayInstrumentations[key] = function (...args) {
            pauseTracking();
            const res = method.apply(this, args);
            resetTracking();
            return res;
        };
    });
    function createGetter(isReadonly = false, shallow = false) {
        return function get(target, key, receiver) {
            if (key === "__v_isReactive" /* IS_REACTIVE */) {
                return !isReadonly;
            }
            else if (key === "__v_isReadonly" /* IS_READONLY */) {
                return isReadonly;
            }
            else if (key === "__v_raw" /* RAW */ &&
                receiver === (isReadonly ? readonlyMap : reactiveMap).get(target)) {
                return target;
            }
            const targetIsArray = isArray(target);
            if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
                return Reflect.get(arrayInstrumentations, key, receiver);
            }
            const res = Reflect.get(target, key, receiver);
            if (isSymbol(key)
                ? builtInSymbols.has(key)
                : key === `__proto__` || key === `__v_isRef`) {
                return res;
            }
            if (!isReadonly) {
                track(target, "get" /* GET */, key);
            }
            if (shallow) {
                return res;
            }
            if (isRef(res)) {
                // ref unwrapping - does not apply for Array + integer key.
                const shouldUnwrap = !targetIsArray || !isIntegerKey(key);
                return shouldUnwrap ? res.value : res;
            }
            if (isObject(res)) {
                // Convert returned value into a proxy as well. we do the isObject check
                // here to avoid invalid value warning. Also need to lazy access readonly
                // and reactive here to avoid circular dependency.
                return isReadonly ? readonly(res) : reactive(res);
            }
            return res;
        };
    }
    const set = /*#__PURE__*/ createSetter();
    const shallowSet = /*#__PURE__*/ createSetter(true);
    function createSetter(shallow = false) {
        return function set(target, key, value, receiver) {
            const oldValue = target[key];
            if (!shallow) {
                value = toRaw(value);
                if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
                    oldValue.value = value;
                    return true;
                }
            }
            const hadKey = isArray(target) && isIntegerKey(key)
                ? Number(key) < target.length
                : hasOwn(target, key);
            const result = Reflect.set(target, key, value, receiver);
            // don't trigger if target is something up in the prototype chain of original
            if (target === toRaw(receiver)) {
                if (!hadKey) {
                    trigger(target, "add" /* ADD */, key, value);
                }
                else if (hasChanged(value, oldValue)) {
                    trigger(target, "set" /* SET */, key, value, oldValue);
                }
            }
            return result;
        };
    }
    function deleteProperty(target, key) {
        const hadKey = hasOwn(target, key);
        const oldValue = target[key];
        const result = Reflect.deleteProperty(target, key);
        if (result && hadKey) {
            trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
        }
        return result;
    }
    function has(target, key) {
        const result = Reflect.has(target, key);
        if (!isSymbol(key) || !builtInSymbols.has(key)) {
            track(target, "has" /* HAS */, key);
        }
        return result;
    }
    function ownKeys(target) {
        track(target, "iterate" /* ITERATE */, isArray(target) ? 'length' : ITERATE_KEY);
        return Reflect.ownKeys(target);
    }
    const mutableHandlers = {
        get,
        set,
        deleteProperty,
        has,
        ownKeys
    };
    const readonlyHandlers = {
        get: readonlyGet,
        set(target, key) {
            {
                console.warn(`Set operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        },
        deleteProperty(target, key) {
            {
                console.warn(`Delete operation on key "${String(key)}" failed: target is readonly.`, target);
            }
            return true;
        }
    };
    const shallowReactiveHandlers = extend({}, mutableHandlers, {
        get: shallowGet,
        set: shallowSet
    });
    // Props handlers are special in the sense that it should not unwrap top-level
    // refs (in order to allow refs to be explicitly passed down), but should
    // retain the reactivity of the normal readonly object.
    const shallowReadonlyHandlers = extend({}, readonlyHandlers, {
        get: shallowReadonlyGet
    });

    const toReactive = (value) => isObject(value) ? reactive(value) : value;
    const toReadonly = (value) => isObject(value) ? readonly(value) : value;
    const toShallow = (value) => value;
    const getProto = (v) => Reflect.getPrototypeOf(v);
    function get$1(target, key, isReadonly = false, isShallow = false) {
        // #1772: readonly(reactive(Map)) should return readonly + reactive version
        // of the value
        target = target["__v_raw" /* RAW */];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "get" /* GET */, key);
        }
        !isReadonly && track(rawTarget, "get" /* GET */, rawKey);
        const { has } = getProto(rawTarget);
        const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
        if (has.call(rawTarget, key)) {
            return wrap(target.get(key));
        }
        else if (has.call(rawTarget, rawKey)) {
            return wrap(target.get(rawKey));
        }
    }
    function has$1(key, isReadonly = false) {
        const target = this["__v_raw" /* RAW */];
        const rawTarget = toRaw(target);
        const rawKey = toRaw(key);
        if (key !== rawKey) {
            !isReadonly && track(rawTarget, "has" /* HAS */, key);
        }
        !isReadonly && track(rawTarget, "has" /* HAS */, rawKey);
        return key === rawKey
            ? target.has(key)
            : target.has(key) || target.has(rawKey);
    }
    function size(target, isReadonly = false) {
        target = target["__v_raw" /* RAW */];
        !isReadonly && track(toRaw(target), "iterate" /* ITERATE */, ITERATE_KEY);
        return Reflect.get(target, 'size', target);
    }
    function add(value) {
        value = toRaw(value);
        const target = toRaw(this);
        const proto = getProto(target);
        const hadKey = proto.has.call(target, value);
        const result = target.add(value);
        if (!hadKey) {
            trigger(target, "add" /* ADD */, value, value);
        }
        return result;
    }
    function set$1(key, value) {
        value = toRaw(value);
        const target = toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has.call(target, key);
        }
        else {
            checkIdentityKeys(target, has, key);
        }
        const oldValue = get.call(target, key);
        const result = target.set(key, value);
        if (!hadKey) {
            trigger(target, "add" /* ADD */, key, value);
        }
        else if (hasChanged(value, oldValue)) {
            trigger(target, "set" /* SET */, key, value, oldValue);
        }
        return result;
    }
    function deleteEntry(key) {
        const target = toRaw(this);
        const { has, get } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
            key = toRaw(key);
            hadKey = has.call(target, key);
        }
        else {
            checkIdentityKeys(target, has, key);
        }
        const oldValue = get ? get.call(target, key) : undefined;
        // forward the operation before queueing reactions
        const result = target.delete(key);
        if (hadKey) {
            trigger(target, "delete" /* DELETE */, key, undefined, oldValue);
        }
        return result;
    }
    function clear() {
        const target = toRaw(this);
        const hadItems = target.size !== 0;
        const oldTarget =  isMap(target)
                ? new Map(target)
                : new Set(target)
            ;
        // forward the operation before queueing reactions
        const result = target.clear();
        if (hadItems) {
            trigger(target, "clear" /* CLEAR */, undefined, undefined, oldTarget);
        }
        return result;
    }
    function createForEach(isReadonly, isShallow) {
        return function forEach(callback, thisArg) {
            const observed = this;
            const target = observed["__v_raw" /* RAW */];
            const rawTarget = toRaw(target);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly && track(rawTarget, "iterate" /* ITERATE */, ITERATE_KEY);
            return target.forEach((value, key) => {
                // important: make sure the callback is
                // 1. invoked with the reactive map as `this` and 3rd arg
                // 2. the value received should be a corresponding reactive/readonly.
                return callback.call(thisArg, wrap(value), wrap(key), observed);
            });
        };
    }
    function createIterableMethod(method, isReadonly, isShallow) {
        return function (...args) {
            const target = this["__v_raw" /* RAW */];
            const rawTarget = toRaw(target);
            const targetIsMap = isMap(rawTarget);
            const isPair = method === 'entries' || (method === Symbol.iterator && targetIsMap);
            const isKeyOnly = method === 'keys' && targetIsMap;
            const innerIterator = target[method](...args);
            const wrap = isReadonly ? toReadonly : isShallow ? toShallow : toReactive;
            !isReadonly &&
                track(rawTarget, "iterate" /* ITERATE */, isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY);
            // return a wrapped iterator which returns observed versions of the
            // values emitted from the real iterator
            return {
                // iterator protocol
                next() {
                    const { value, done } = innerIterator.next();
                    return done
                        ? { value, done }
                        : {
                            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
                            done
                        };
                },
                // iterable protocol
                [Symbol.iterator]() {
                    return this;
                }
            };
        };
    }
    function createReadonlyMethod(type) {
        return function (...args) {
            {
                const key = args[0] ? `on key "${args[0]}" ` : ``;
                console.warn(`${capitalize(type)} operation ${key}failed: target is readonly.`, toRaw(this));
            }
            return type === "delete" /* DELETE */ ? false : this;
        };
    }
    const mutableInstrumentations = {
        get(key) {
            return get$1(this, key);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, false)
    };
    const shallowInstrumentations = {
        get(key) {
            return get$1(this, key, false, true);
        },
        get size() {
            return size(this);
        },
        has: has$1,
        add,
        set: set$1,
        delete: deleteEntry,
        clear,
        forEach: createForEach(false, true)
    };
    const readonlyInstrumentations = {
        get(key) {
            return get$1(this, key, true);
        },
        get size() {
            return size(this, true);
        },
        has(key) {
            return has$1.call(this, key, true);
        },
        add: createReadonlyMethod("add" /* ADD */),
        set: createReadonlyMethod("set" /* SET */),
        delete: createReadonlyMethod("delete" /* DELETE */),
        clear: createReadonlyMethod("clear" /* CLEAR */),
        forEach: createForEach(true, false)
    };
    const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator];
    iteratorMethods.forEach(method => {
        mutableInstrumentations[method] = createIterableMethod(method, false, false);
        readonlyInstrumentations[method] = createIterableMethod(method, true, false);
        shallowInstrumentations[method] = createIterableMethod(method, false, true);
    });
    function createInstrumentationGetter(isReadonly, shallow) {
        const instrumentations = shallow
            ? shallowInstrumentations
            : isReadonly
                ? readonlyInstrumentations
                : mutableInstrumentations;
        return (target, key, receiver) => {
            if (key === "__v_isReactive" /* IS_REACTIVE */) {
                return !isReadonly;
            }
            else if (key === "__v_isReadonly" /* IS_READONLY */) {
                return isReadonly;
            }
            else if (key === "__v_raw" /* RAW */) {
                return target;
            }
            return Reflect.get(hasOwn(instrumentations, key) && key in target
                ? instrumentations
                : target, key, receiver);
        };
    }
    const mutableCollectionHandlers = {
        get: createInstrumentationGetter(false, false)
    };
    const readonlyCollectionHandlers = {
        get: createInstrumentationGetter(true, false)
    };
    function checkIdentityKeys(target, has, key) {
        const rawKey = toRaw(key);
        if (rawKey !== key && has.call(target, rawKey)) {
            const type = toRawType(target);
            console.warn(`Reactive ${type} contains both the raw and reactive ` +
                `versions of the same object${type === `Map` ? ` as keys` : ``}, ` +
                `which can lead to inconsistencies. ` +
                `Avoid differentiating between the raw and reactive versions ` +
                `of an object and only use the reactive version if possible.`);
        }
    }

    const reactiveMap = new WeakMap();
    const readonlyMap = new WeakMap();
    function targetTypeMap(rawType) {
        switch (rawType) {
            case 'Object':
            case 'Array':
                return 1 /* COMMON */;
            case 'Map':
            case 'Set':
            case 'WeakMap':
            case 'WeakSet':
                return 2 /* COLLECTION */;
            default:
                return 0 /* INVALID */;
        }
    }
    function getTargetType(value) {
        return value["__v_skip" /* SKIP */] || !Object.isExtensible(value)
            ? 0 /* INVALID */
            : targetTypeMap(toRawType(value));
    }
    function reactive(target) {
        // if trying to observe a readonly proxy, return the readonly version.
        if (target && target["__v_isReadonly" /* IS_READONLY */]) {
            return target;
        }
        return createReactiveObject(target, false, mutableHandlers, mutableCollectionHandlers);
    }
    function readonly(target) {
        return createReactiveObject(target, true, readonlyHandlers, readonlyCollectionHandlers);
    }
    function createReactiveObject(target, isReadonly, baseHandlers, collectionHandlers) {
        if (!isObject(target)) {
            {
                console.warn(`value cannot be made reactive: ${String(target)}`);
            }
            return target;
        }
        // target is already a Proxy, return it.
        // exception: calling readonly() on a reactive object
        if (target["__v_raw" /* RAW */] &&
            !(isReadonly && target["__v_isReactive" /* IS_REACTIVE */])) {
            return target;
        }
        // target already has corresponding Proxy
        const proxyMap = isReadonly ? readonlyMap : reactiveMap;
        const existingProxy = proxyMap.get(target);
        if (existingProxy) {
            return existingProxy;
        }
        // only a whitelist of value types can be observed.
        const targetType = getTargetType(target);
        if (targetType === 0 /* INVALID */) {
            return target;
        }
        const proxy = new Proxy(target, targetType === 2 /* COLLECTION */ ? collectionHandlers : baseHandlers);
        proxyMap.set(target, proxy);
        return proxy;
    }
    function isReactive(value) {
        if (isReadonly(value)) {
            return isReactive(value["__v_raw" /* RAW */]);
        }
        return !!(value && value["__v_isReactive" /* IS_REACTIVE */]);
    }
    function isReadonly(value) {
        return !!(value && value["__v_isReadonly" /* IS_READONLY */]);
    }
    function toRaw(observed) {
        return ((observed && toRaw(observed["__v_raw" /* RAW */])) || observed);
    }
    function isRef(r) {
        return Boolean(r && r.__v_isRef === true);
    }

    class ComputedRefImpl {
        constructor(getter, _setter, isReadonly) {
            this._setter = _setter;
            this._dirty = true;
            this.__v_isRef = true;
            this.effect = effect(getter, {
                lazy: true,
                scheduler: () => {
                    if (!this._dirty) {
                        this._dirty = true;
                        trigger(toRaw(this), "set" /* SET */, 'value');
                    }
                }
            });
            this["__v_isReadonly" /* IS_READONLY */] = isReadonly;
        }
        get value() {
            if (this._dirty) {
                this._value = this.effect();
                this._dirty = false;
            }
            track(toRaw(this), "get" /* GET */, 'value');
            return this._value;
        }
        set value(newValue) {
            this._setter(newValue);
        }
    }
    function computed(getterOrOptions) {
        let getter;
        let setter;
        if (isFunction(getterOrOptions)) {
            getter = getterOrOptions;
            setter =  () => {
                    console.warn('Write operation failed: computed value is readonly');
                }
                ;
        }
        else {
            getter = getterOrOptions.get;
            setter = getterOrOptions.set;
        }
        return new ComputedRefImpl(getter, setter, isFunction(getterOrOptions) || !getterOrOptions.set);
    }

    function getDocument() {
        return document;
    }

    function createElement(tag, options) {
        return getDocument().createElement(tag, options);
    }

    function createElementNS(namespaceURI, tag, options) {
        return getDocument().createElementNS(namespaceURI, tag, options);
    }

    function createFragment() {
        return document.createDocumentFragment();
    }

    function setAttribute(el, name, value) {
        if (value !== undefined) {
            el.setAttribute(name, value);
        }
        else {
            el.removeAttribute(name);
        }
    }

    function addEventListener(target, type, listener, options) {
        target.addEventListener(type, listener, options);
    }

    function createComment(value) {
        return document.createComment(value);
    }

    function appendChild(container, child) {
        if (!child) {
            document.appendChild(container);
        }
        else {
            container.appendChild(child);
        }
    }

    function insertBefore(child, anchor) {
        const container = anchor.parentNode;
        container && container.insertBefore(child, anchor);
    }

    function removeChild(child) {
        const container = child.parentNode;
        container && container.removeChild(child);
    }

    function createTextNode(value) {
        return document.createTextNode(value);
    }

    function createPlaceholder(value) {
        return  createComment(value) ;
    }

    function querySelector(selector) {
        return document.querySelector(selector);
    }

    function getHead() {
        return document.head;
    }

    var CSSRULE_TYPES;
    (function (CSSRULE_TYPES) {
        CSSRULE_TYPES[CSSRULE_TYPES["CHARSET_RULE"] = 2] = "CHARSET_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["FONT_FACE_RULE"] = 5] = "FONT_FACE_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["IMPORT_RULE"] = 3] = "IMPORT_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["KEYFRAMES_RULE"] = 7] = "KEYFRAMES_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["KEYFRAME_RULE"] = 8] = "KEYFRAME_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["MEDIA_RULE"] = 4] = "MEDIA_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["NAMESPACE_RULE"] = 10] = "NAMESPACE_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["PAGE_RULE"] = 6] = "PAGE_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["STYLE_RULE"] = 1] = "STYLE_RULE";
        CSSRULE_TYPES[CSSRULE_TYPES["SUPPORTS_RULE"] = 12] = "SUPPORTS_RULE";
    })(CSSRULE_TYPES || (CSSRULE_TYPES = {}));
    var LIFECYCLE_KEYS;
    (function (LIFECYCLE_KEYS) {
        LIFECYCLE_KEYS["mounted"] = "_h_mounted";
        LIFECYCLE_KEYS["unmounted"] = "_h_unmounted";
        LIFECYCLE_KEYS["updated"] = "_h_updated";
        LIFECYCLE_KEYS["elementUnmounted"] = "_h_element_unmounted";
    })(LIFECYCLE_KEYS || (LIFECYCLE_KEYS = {}));
    var NS;
    (function (NS) {
        NS["SVG"] = "http://www.w3.org/2000/svg";
        NS["XHTML"] = "http://www.w3.org/1999/xhtml";
    })(NS || (NS = {}));
    function isMediaRule(value) {
        if (value.type === CSSRULE_TYPES.MEDIA_RULE)
            return true;
        return false;
    }
    function isKeyframesRule(value) {
        if (value.type === CSSRULE_TYPES.KEYFRAMES_RULE)
            return true;
        return false;
    }
    function isStyleSheet(value) {
        if (value instanceof CSSStyleSheet)
            return true;
        return false;
    }
    function isElement(value) {
        return value instanceof Element;
    }
    function getLast(stack) {
        return stack[stack.length - 1];
    }
    function logError(err) {
        console.error(`[Hope error]: ${err}`);
    }
    function forEachObj(obj, cb) {
        Object.keys(obj).forEach((key) => cb(obj[key], key));
    }
    function once(fn) {
        return (...arg) => {
            if (fn._hasRun)
                return;
            fn(...arg);
            fn._hasRun = true;
        };
    }
    function addScopeForSelector(selector, scopeId) {
        selector = selector.trim();
        const arr = selector.split(',').map((str) => {
            str = str.trim();
            if (!str)
                return;
            if (isAnimationSelector(str))
                return str;
            if (str.indexOf(':') >= 0) {
                return str.replace(':', `[${scopeId}]:`);
            }
            return str + `[${scopeId}]`;
        });
        return arr.filter((v) => v).join(',');
    }
    function isAnimationSelector(selector) {
        if (selector === 'to' ||
            selector === 'from' ||
            selector[selector.length - 1] === '%')
            return true;
        return false;
    }

    let currentElement;
    const elementStack = [];
    const blockFragmentStack = [];
    // 用于存储生成的元素，最终添加到 DOM 树中
    const fragment = createFragment();
    let blockFragment;
    const tagNameStack = [];
    function start(tag) {
        currentElement = isSVG(tag)
            ? createElementNS(NS.SVG, tag)
            : createElement(tag);
        // 需放在 createElement 之后
        tagNameStack.push(tag);
        appendElement();
        if (blockFragment) {
            blockFragment._elementStack.push(currentElement);
        }
        else {
            elementStack.push(currentElement);
        }
    }
    function end() {
        tagNameStack.pop();
        if (blockFragment) {
            const stack = blockFragment._elementStack;
            stack.pop();
            currentElement = getBlockCurrentParent(stack);
        }
        else {
            elementStack.pop();
            currentElement = getLast(elementStack);
        }
    }
    function mount(container) {
        container.innerHTML = '';
        appendChild(container, fragment);
    }
    function getCurrentElement() {
        return currentElement;
    }
    function getCurrntBlockFragment() {
        return blockFragment;
    }
    function createBlockFragment() {
        const result = createFragment();
        result._elementStack = [];
        result._isSVG = isSVG('');
        return result;
    }
    function setBlockFragment(value) {
        value._parent || (value._parent = blockFragment);
        blockFragment = value;
        blockFragmentStack.push(value);
        currentElement = undefined;
    }
    function resetBlockFragment() {
        blockFragmentStack.pop();
        blockFragment = getLast(blockFragmentStack);
        if (blockFragment) {
            currentElement = getLast(blockFragment._elementStack);
        }
        else {
            currentElement = getLast(elementStack);
        }
    }
    function getFragment() {
        return fragment;
    }
    function getContainer() {
        return getCurrentElement() || getCurrntBlockFragment() || getFragment();
    }
    function getTagNameStack() {
        return tagNameStack;
    }
    function isSVG(tagName) {
        if (tagName === 'svg')
            return true;
        const tagNameStack = getTagNameStack();
        let length = tagNameStack.length;
        while (length--) {
            if (tagNameStack[length] === 'foreignObject')
                return false;
            if (tagNameStack[length] === 'svg')
                return true;
        }
        // 如果一个元素在一个 block 中，则会在 fragment 中保存
        // 其子元素是否为 svg 的状态，以便在动态更新时获取正确的状态值。
        const currentBlockFragment = getCurrntBlockFragment();
        return currentBlockFragment ? currentBlockFragment._isSVG : false;
    }
    function appendElement() {
        if (!currentElement)
            return;
        if (blockFragment) {
            appendBlockElement();
            return;
        }
        if (!elementStack.length) {
            appendChild(fragment, currentElement);
        }
        else {
            appendChild(getLast(elementStack), currentElement);
        }
    }
    function appendBlockElement() {
        const stack = blockFragment._elementStack;
        const parent = getBlockCurrentParent(stack);
        if (parent) {
            appendChild(parent, currentElement);
        }
        else {
            appendChild(blockFragment, currentElement);
        }
    }
    /**
     * 获取在 block 中新生成的元素的父元素，
     * 注意当存在组件时，会往 stack 中 push
     * 一个占位符节点，用以保存生命周期钩子，
     * 该节点不能作为父节点，所以要判断一下。
     * @param stack
     */
    function getBlockCurrentParent(stack) {
        let length = stack.length;
        while (length--) {
            const el = stack[length];
            if (isElement(el)) {
                return el;
            }
        }
        return undefined;
    }

    function collectElementUnmountedHook(hook) {
        addSomethingInToBlockRootElement(LIFECYCLE_KEYS.elementUnmounted, hook);
    }
    function collectUnmountedHook(hooks) {
        addSomethingInToBlockRootElement(LIFECYCLE_KEYS.unmounted, hooks);
    }
    /**
     * 处理并销毁列表中的元素
     * @param list
     * @param key
     * @param operator
     */
    function destroy(list, key, operator) {
        if (!list)
            return;
        list.forEach((some) => {
            operator(some);
            // 这个列表的最前面的，在视图中是嵌套最深的，
            // 当前 block 的子 block 的列表应该直接被
            // 清空，感觉这样性能会好些。。
            let canClear = true;
            some[key].forEach((collection) => {
                if (collection === list) {
                    canClear = false;
                    return;
                }
                if (canClear) {
                    // TODO: 不确定这里的 clear 有没有必要！
                    // 如果不 clear ，不知道会不会造成循环引用？
                    collection.size && collection.clear();
                }
                else {
                    collection.delete(some);
                }
            });
        });
        list.clear();
    }
    function addSomethingInToBlockRootElement(key, something, blockFragment = getCurrntBlockFragment(), childBlockFragment) {
        if (!blockFragment)
            return;
        // 每个 block 应该保存下父 block 的 rootElement，
        // 以便在更新的时候能够获取到正确的 rootElement。
        const blockRootElement = blockFragment._elementStack[0] ||
            childBlockFragment?._parentBlockRootElement;
        if (blockRootElement) {
            (blockRootElement[key] || (blockRootElement[key] = new Set())).add(something);
            // 用于对象销毁时清空列表。
            (something[key] || (something[key] = [])).push(blockRootElement[key]);
            childBlockFragment &&
                (childBlockFragment._parentBlockRootElement = blockRootElement);
        }
        blockFragment._parent &&
            addSomethingInToBlockRootElement(key, something, blockFragment._parent, blockFragment);
    }

    let isFlushing = false;
    let isFlushPending = false;
    const queue = [];
    let flushIndex = 0;
    const pendingPostFlushCbs = [];
    let activePostFlushCbs = null;
    let postFlushIndex = 0;
    const resolvedPromise = Promise.resolve();
    let currentFlushPromise = null;
    const RECURSION_LIMIT = 100;
    function nextTick(fn) {
        const p = currentFlushPromise || resolvedPromise;
        return fn ? p.then(fn) : p;
    }
    function queueJob(job) {
        // the dedupe search uses the startIndex argument of Array.includes()
        // by default the search index includes the current job that is being run
        // so it cannot recursively trigger itself again.
        // if the job is a watch() callback, the search will start with a +1 index to
        // allow it recursively trigger itself - it is the user's responsibility to
        // ensure it doesn't end up in an infinite loop.
        if (!queue.length ||
            !queue.includes(job, isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex)) {
            queue.push(job);
            queueFlush();
        }
    }
    function queueFlush() {
        if (!isFlushing && !isFlushPending) {
            isFlushPending = true;
            currentFlushPromise = resolvedPromise.then(flushJobs);
        }
    }
    function queueCb(cb, activeQueue, pendingQueue, index) {
        if (!isArray(cb)) {
            if (!activeQueue ||
                !activeQueue.includes(cb, cb.allowRecurse ? index + 1 : index)) {
                pendingQueue.push(cb);
            }
        }
        else {
            // if cb is an array, it is a component lifecycle hook which can only be
            // triggered by a job, which is already deduped in the main queue, so
            // we can skip duplicate check here to improve perf
            pendingQueue.push(...cb);
        }
    }
    function queuePostFlushCb(cb) {
        queueCb(cb, activePostFlushCbs, pendingPostFlushCbs, postFlushIndex);
    }
    function flushPostFlushCbs(seen) {
        if (pendingPostFlushCbs.length) {
            const deduped = [...new Set(pendingPostFlushCbs)];
            pendingPostFlushCbs.length = 0;
            if (activePostFlushCbs) {
                activePostFlushCbs.push(...deduped);
                return;
            }
            activePostFlushCbs = deduped;
            {
                seen = seen || new Map();
            }
            for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
                {
                    checkRecursiveUpdates(seen, activePostFlushCbs[postFlushIndex]);
                }
                activePostFlushCbs[postFlushIndex]();
            }
            activePostFlushCbs = null;
            postFlushIndex = 0;
        }
    }
    const getId = (job) => job.id == null ? Infinity : job.id;
    function flushJobs(seen) {
        isFlushPending = false;
        isFlushing = true;
        {
            seen = seen || new Map();
        }
        queue.sort((a, b) => getId(a) - getId(b));
        for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
            const job = queue[flushIndex];
            if (job) {
                {
                    checkRecursiveUpdates(seen, job);
                }
                job();
            }
        }
        flushIndex = 0;
        queue.length = 0;
        flushPostFlushCbs(seen);
        isFlushing = false;
        currentFlushPromise = null;
        // some postFlushCb queued jobs!
        // keep flushing until it drains.
        if (queue.length || pendingPostFlushCbs.length) {
            flushJobs(seen);
        }
    }
    function checkRecursiveUpdates(seen, fn) {
        if (!seen.has(fn)) {
            seen.set(fn, 1);
        }
        else {
            const count = seen.get(fn);
            if (count > RECURSION_LIMIT) {
                throw new Error(`Maximum recursive updates exceeded. ` +
                    `This means you have a reactive effect that is mutating its own ` +
                    `dependencies and thus recursively triggering itself. Possible sources ` +
                    `include component template, render function, updated hook or ` +
                    `watcher source function.`);
            }
            else {
                seen.set(fn, count + 1);
            }
        }
    }

    let currentLifecycle;
    let stack = [];
    function setLifecycleHandlers() {
        currentLifecycle && stack.push(currentLifecycle);
        currentLifecycle = {
            mountedHandlers: [],
            unmountedHandlers: [],
            updatedHandlers: [],
        };
    }
    function resetLifecycleHandlers() {
        currentLifecycle = stack.pop();
    }
    function getLifecycleHandlers() {
        return currentLifecycle || {};
    }
    function callMounted(handlers) {
        queuePostFlushCb(handlers);
    }
    function callUnmounted(handlers) {
        queuePostFlushCb(handlers);
    }
    function callUpdated(handlers) {
        queuePostFlushCb(handlers);
    }
    function callElementUnmounted(handlers) {
        queuePostFlushCb(handlers);
    }
    /**
     * 当前能够使用组件的生命周期函数
     */
    function canUseLifecycle() {
        return !!currentLifecycle;
    }

    let componentOn;
    function setComponentOn() {
        componentOn = {};
    }
    function resetComponentOn() {
        componentOn = null;
    }
    function getComponentOn() {
        return componentOn;
    }

    let slots;
    function setSlots() {
        slots = {};
    }
    function resetSlots() {
        slots = null;
    }
    function getSlots() {
        return slots;
    }

    let componentProps;
    function setComponentProps() {
        componentProps = reactive({});
    }
    function resetComponentProps() {
        componentProps = null;
    }
    function getComponentProps() {
        return componentProps;
    }

    let queueAddScope;
    function setQueueAddScope(value) {
        queueAddScope = value;
    }
    function addScopeId() {
        if (!queueAddScope)
            return;
        const el = getCurrentElement();
        // 添加到一个队列，延迟执行，目的是为了在定义组件时
        // style 函数可以在组件中的任何位置使用。
        queueAddScope.push((scopeId) => {
            scopeId && setAttribute(el, scopeId, '');
        });
    }

    const styleElements = {};
    function getStyleSheet(componentId) {
        const styleEl = registerStyleElement(componentId);
        if (styleEl.sheet) {
            return styleEl.sheet;
        }
        // Avoid Firefox quirk where the style element might not have a sheet property
        // (from styled-components)
        const { styleSheets } = getDocument();
        for (let i = 0, l = styleSheets.length; i < l; i++) {
            const sheet = styleSheets[i];
            if (sheet.ownerNode === styleEl) {
                return sheet;
            }
        }
         logError('获取 StyleSheet 失败！');
    }
    function getStyleElement(componentId) {
        return styleElements[componentId];
    }
    function deleteStyleElement(componentId) {
        delete styleElements[componentId];
    }
    function registerStyleElement(componentId, target) {
        if (styleElements[componentId]) {
            return styleElements[componentId];
        }
        const styleEl = createStyleElement();
        (target || getHead()).appendChild(styleEl);
        return (styleElements[componentId] = styleEl);
    }
    function createStyleElement() {
        const style = createElement('style');
        setAttribute(style, 'type', 'text/css');
        const textNode = createTextNode('');
        // Avoid Edge bug where empty style elements don't create sheets
        // (from styled-components)
        style.appendChild(textNode);
        return style;
    }

    let stackGroups = [];
    function createCssRule(selector, style, componentId) {
        let group = getLast(stackGroups);
        if (!group && componentId) {
            group = getStyleSheet(componentId);
        }
        const cssText = selector + style;
        if (isStyleSheet(group) || isMediaRule(group)) {
            const lenght = group.cssRules.length;
            group.insertRule(cssText, lenght);
            return group.cssRules[lenght];
        }
        if (isKeyframesRule(group)) {
            group.appendRule(cssText);
            return group.findRule(selector);
        }
    }
    function setGroup(v) {
        stackGroups.push(v);
    }
    function resetGroup() {
        stackGroups.pop();
    }

    let keyframesId = 0;
    function keyframes(componentId, block, firstName) {
        const name = firstName || `${componentId}-${keyframesId}`;
        keyframesId++;
        setGroup(createCssRule(`@keyframes ${name}`, '{}', componentId));
        block();
        resetGroup();
        return name;
    }

    function media(componentId, condition, block) {
        const mediaRule = createCssRule('@media' + condition, '{}', componentId);
        setGroup(mediaRule);
        block();
        resetGroup();
        return mediaRule;
    }

    const COMMON_WARN = '应该在定义组件的时候，写在组件定义中。';
    function onMounted(handler) {
        if ( !canUseLifecycle())
            return logError(`onMounted ${COMMON_WARN}`);
        const currentLifecycle = getLifecycleHandlers();
        currentLifecycle.mountedHandlers &&
            currentLifecycle.mountedHandlers.push(handler);
        // 调用已挂载钩子
        callMounted(handler);
    }
    function onUnmounted(handler) {
        if ( !canUseLifecycle())
            return logError(`onUnmounted ${COMMON_WARN}`);
        const currentLifecycle = getLifecycleHandlers();
        currentLifecycle.unmountedHandlers &&
            currentLifecycle.unmountedHandlers.push(handler);
    }
    function onUpdated(handler) {
        if ( !canUseLifecycle())
            return logError(`onUpdated ${COMMON_WARN}`);
        const currentLifecycle = getLifecycleHandlers();
        currentLifecycle.updatedHandlers &&
            currentLifecycle.updatedHandlers.push(handler);
        // 一开始调用一次更新钩子
        callUpdated(handler);
    }
    function onElementUnmounted(handler) {
        collectElementUnmountedHook(handler);
    }

    function autoUpdate(block) {
        const { updatedHandlers } = getLifecycleHandlers();
        const ef = effect(() => {
            block();
            updatedHandlers && callUpdated(updatedHandlers);
        }, { scheduler: queueJob });
        onElementUnmounted(() => stop(ef));
    }

    function mount$1(containerOrSelector) {
        const container = normalizeContainer(containerOrSelector);
        if (container) {
            // 等待浏览器处理完样式信息，
            // 有利于提高首次渲染速度。
            setTimeout(() => {
                mount(container);
                flushPostFlushCbs();
            });
        }
    }
    function normalizeContainer(container) {
        if (isString(container)) {
            const result = querySelector(container);
            if ( !result) {
                logError(`找不到以 ${container} 为选择器的元素！`);
            }
            return result;
        }
        else if (isElement(container)) {
            return container;
        }
         logError('无效的容器。');
        return null;
    }

    // dynamic style id
    // 每渲染一次组件就会自增一下
    let dsid = 0;
    const dsidStack = [];
    // component id
    let cid = 0;
    const cidStack = [];
    const stackForAddScope = [];
    const styleTypes = {};
    // 记录某一个组件的实例个数
    const componentInstanceCount = {};
    const componentCssRuleId = {};
    let betweenStartAndEnd = false;
    function defineComponent(setup) {
        let result;
        cid++;
        const startTag = () => {
            const container = getContainer();
            const startPlaceholder = createPlaceholder(`${setup.name || 'component'} start`);
            appendChild(container, startPlaceholder);
            pushStartToBlockFragment(startPlaceholder);
            setSlots();
            setComponentProps();
            setComponentOn();
            betweenStartAndEnd = true;
        };
        startTag.cid = cid;
        const endTag = (options = {}) => {
            betweenStartAndEnd = false;
            // 放在 end 标签，可以确保组件指令函数中的数据
            // 更新时正确的调用组件的父组件的生命周期钩子
            setLifecycleHandlers();
            dsid++;
            dsidStack.push(dsid);
            cidStack.push(startTag.cid);
            stackForAddScope.push([]);
            const props = options.props || getComponentProps();
            const slots = options.slots || getSlots();
            const lifecycle = getLifecycleHandlers();
            const on = options.on || getComponentOn();
            const emit = (type, ...arg) => {
                on[type] && on[type](...arg);
            };
            collectUnmountedHook(lifecycle.unmountedHandlers);
            resetSlots();
            resetComponentProps();
            resetComponentOn();
            setQueueAddScope(getCurrentQueueAddScope());
            // 页面中没有该组件时，remove 掉相关 style 元素
            const componentId = getCurrentCid();
            onUnmounted(() => {
                if (--componentInstanceCount[componentId] === 0) {
                    const styleEl = getStyleElement(componentId);
                    styleEl && removeChild(styleEl);
                    deleteStyleElement(componentId);
                    delete componentInstanceCount[componentId];
                }
            });
            componentCssRuleId[componentId] = 0;
            setup({ props, slots, emit });
            popStartFromBlockFragment();
            flushQueueAddScope();
            stackForAddScope.pop();
            setQueueAddScope(getCurrentQueueAddScope());
            cidStack.pop();
            dsidStack.pop();
            // 必须放在 setup 函数之后
            resetLifecycleHandlers();
            const endPlaceholder = createPlaceholder(`${setup.name || 'component'} end`);
            const container = getContainer();
            appendChild(container, endPlaceholder);
            incrementComponentInstanceCount(componentId);
        };
        result = [startTag, endTag];
        result.mount = (options) => {
            if (isString(options) || isElement(options)) {
                options = { target: options, props: reactive({}) };
            }
            options.props = (isReactive(options.props)
                ? options.props
                : isObject(options.props)
                    ? reactive(options.props)
                    : reactive({}));
            startTag();
            endTag(options);
            mount$1(options.target);
            return options.props;
        };
        return result;
    }
    /**
     * 获取组件实例的 dynamic style id,
     * 相同组件不同实例之间 dynamic style id 不相同
     */
    function getCurrentDsid() {
        const dsid = getLast(dsidStack);
        return dsid ? `h-dsid-${dsid}` : undefined;
    }
    /**
     * 获取组件 cid,
     * 相同组件不同实例之间 cid 相同
     */
    function getCurrentCid() {
        const cid = getLast(cidStack);
        return cid ? `h-cid-${cid}` : undefined;
    }
    function setHasDynamic(value) {
        const componentId = getCurrentCid();
        (styleTypes[componentId] ||
            (styleTypes[componentId] = { hasDynamic: false, hasStatic: false })).hasDynamic = value;
    }
    function setHasStatic(value) {
        const componentId = getCurrentCid();
        (styleTypes[componentId] ||
            (styleTypes[componentId] = { hasDynamic: false, hasStatic: false })).hasStatic = value;
    }
    function getComponentInstanceCount(componentId) {
        return componentInstanceCount[componentId];
    }
    function getComponentCssRuleId(componentId, groupId) {
        if (groupId && groupId.length) {
            return groupId.join('-') + '-' + componentCssRuleId[componentId];
        }
        return componentCssRuleId[componentId];
    }
    function incrementComponentCssRuleId(componentId) {
        componentCssRuleId[componentId]++;
    }
    function setComponentCssRuleId(componentId, value) {
        componentCssRuleId[componentId] = value;
    }
    /**
     * 表示代码运行到组件的开标签和闭标签之间的区域
     */
    function isBetweenStartAndEnd() {
        return betweenStartAndEnd;
    }
    function incrementComponentInstanceCount(cid) {
        if (cid in componentInstanceCount) {
            return componentInstanceCount[cid]++;
        }
        componentInstanceCount[cid] = 1;
    }
    function hasDynamicStyle() {
        const styleType = styleTypes[getCurrentCid()];
        return styleType ? styleType.hasDynamic : false;
    }
    function hasStaticStyle() {
        const styleType = styleTypes[getCurrentCid()];
        return styleType ? styleType.hasStatic : false;
    }
    function getCurrentQueueAddScope() {
        return getLast(stackForAddScope);
    }
    /**
     * 开始执行添加 scopeId 的活动
     */
    function flushQueueAddScope() {
        getCurrentQueueAddScope().forEach((job) => {
            const cid = getCurrentCid();
            hasStaticStyle() && job(cid);
            hasDynamicStyle() && job(getCurrentDsid());
        });
    }
    /**
     * 把组件的 start 占位符 push 进 blockFragment 中
     * 的 stack 中，用以当 block 的根元素是组件时，收集
     * 组件的 effect 和 hooks。
     * @param start
     */
    function pushStartToBlockFragment(start) {
        const blockFragment = getCurrntBlockFragment();
        if (blockFragment) {
            blockFragment._elementStack.push(start);
        }
    }
    /**
     * 及时清除掉之前添加的 start 占位符。
     */
    function popStartFromBlockFragment() {
        const blockFragment = getCurrntBlockFragment();
        if (blockFragment) {
            blockFragment._elementStack.pop();
        }
    }

    function cantUseError(keyword) {
        logError(`${keyword} 指令不能在组件上使用。`);
    }

    function outsideError(keyword) {
        logError(`${keyword} 指令应该放在标签函数内部使用。`);
    }

    function hAttr(attrs) {
        if ( isBetweenStartAndEnd())
            return cantUseError('hAttr');
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hAttr');
        if (isReactive(attrs)) {
            autoUpdate(() => forEachObj(attrs, (value, name) => {
                setAttribute(currentElement, name, value);
            }));
        }
        else {
            forEachObj(attrs, (value, name) => {
                if (isFunction(value)) {
                    autoUpdate(() => setAttribute(currentElement, name, value()));
                }
                else {
                    setAttribute(currentElement, name, value);
                }
            });
        }
    }

    const [div, $div] = makeTag('div');
    const [span, $span] = makeTag('span');
    function makeTag(tagName) {
        return [
            (attrs) => {
                start(tagName);
                attrs && hAttr(attrs);
                addScopeId();
            },
            end,
        ];
    }

    function hProp(props) {
        // 组件运行的时候会设置该值，此时说明 hProp 指令
        // 运行在组件内，用以向组件传递 prop。
        if (getComponentProps()) {
            return processComponentProps(props);
        }
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hProp');
        if (isReactive(props)) {
            autoUpdate(() => forEachObj(props, (value, key) => {
                currentElement[key] = value;
            }));
        }
        else {
            forEachObj(props, (value, key) => {
                if (isFunction(value)) {
                    autoUpdate(() => (currentElement[key] = value()));
                }
                else {
                    currentElement[key] = value;
                }
            });
        }
    }
    function processComponentProps(props) {
        const componentProps = getComponentProps();
        if (isReactive(props)) {
            autoUpdate(() => forEachObj(props, (value, key) => {
                componentProps[key] = value;
            }));
        }
        else {
            forEachObj(props, (value, key) => {
                if (isFunction(value)) {
                    autoUpdate(() => (componentProps[key] = value()));
                }
                else {
                    componentProps[key] = value;
                }
            });
        }
    }

    function hOn(type, modifier, listener) {
        if (getComponentOn()) {
            return processComponentOn(type, modifier, listener);
        }
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hOn');
        if (isFunction(modifier)) {
            addEventListener(currentElement, type, modifier);
        }
        else {
            addEventListener(currentElement, type, listener, normalizeOptions(modifier));
        }
    }
    function normalizeOptions(modifier) {
        let result = {};
        const arr = modifier
            .split(' ')
            .map((v) => v.trim())
            .filter((v) => v);
        for (let i = 0; i < arr.length; i++) {
            const k = arr[i];
            if (k === 'capture') {
                return true;
            }
            else {
                result[k] = true;
            }
        }
        return result;
    }
    function processComponentOn(type, modifier, listener) {
        const componentOn = getComponentOn();
        if (isFunction(modifier)) {
            componentOn[type] = modifier;
        }
        else {
            modifier = normalizeOptions(modifier);
            if (modifier.once) {
                componentOn[type] = once(listener);
            }
            else {
                componentOn[type] = listener;
            }
        }
    }

    function hClass(value) {
        if ( isBetweenStartAndEnd())
            return cantUseError('hClass');
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hClass');
        if (isFunction(value)) {
            autoUpdate(() => setAttribute(currentElement, 'class', normalizeClass(value()) || undefined));
        }
        else {
            setAttribute(currentElement, 'class', normalizeClass(value) || undefined);
        }
    }

    function hStyle(value) {
        if ( isBetweenStartAndEnd())
            return cantUseError('hStyle');
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hStyle');
        if (isFunction(value)) {
            autoUpdate(() => setAttribute(currentElement, 'style', stringifyStyle(normalizeStyle(value()))));
        }
        else {
            setAttribute(currentElement, 'style', stringifyStyle(normalizeStyle(value)));
        }
    }

    function hId(value) {
        if ( isBetweenStartAndEnd())
            return cantUseError('hId');
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hId');
        if (isFunction(value)) {
            autoUpdate(() => setAttribute(currentElement, 'id', value()));
        }
        else {
            setAttribute(currentElement, 'id', value);
        }
    }

    function hShow(value) {
        if ( isBetweenStartAndEnd())
            return cantUseError('hShow');
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hShow');
        const cache = createElement('div');
        const placeholder = createPlaceholder('hShow');
        if (isFunction(value)) {
            autoUpdate(() => {
                if (value()) {
                    showElement(currentElement, cache, placeholder);
                }
                else {
                    hideElement(currentElement, cache, placeholder);
                }
            });
        }
        else {
            if (value) {
                showElement(currentElement, cache, placeholder);
            }
            else {
                hideElement(currentElement, cache, placeholder);
            }
        }
    }
    function hideElement(el, cache, placeholder) {
        insertBefore(placeholder, el);
        appendChild(cache, el);
    }
    function showElement(el, cache, placeholder) {
        if (!cache.childNodes.length)
            return;
        insertBefore(el, placeholder);
        removeChild(placeholder);
    }

    function hText(value) {
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hText');
        const textNode = createTextNode('');
        if (isFunction(value)) {
            autoUpdate(() => (textNode.textContent = value()));
        }
        else {
            textNode.textContent = value;
        }
        appendChild(currentElement, textNode);
    }

    function hComment(value) {
        const currentElement = getCurrentElement();
        if ( !currentElement)
            return outsideError('hComment');
        const comment = createComment('');
        if (isFunction(value)) {
            autoUpdate(() => (comment.textContent = value()));
        }
        else {
            comment.textContent = value;
        }
        appendChild(currentElement, comment);
    }

    function hSlot(name, slot) {
        const slots = getSlots();
        if ( !slots)
            return logError('hSlot 只能在组件内使用。');
        if (!slot) {
            slot = name;
            name = 'default';
        }
        slots[name] = slot;
    }

    function block(range) {
        const start = createPlaceholder('block start');
        const end = createPlaceholder('block end');
        const container = getContainer();
        appendChild(container, start);
        appendChild(container, end);
        const blockFragment = createBlockFragment();
        autoUpdate(() => {
            setBlockFragment(blockFragment);
            range();
            resetBlockFragment();
            insertBlockFragment(blockFragment, start, end);
        });
    }
    function insertBlockFragment(fragment, start, end) {
        const firstNode = fragment.firstChild;
        insertBefore(fragment, end);
        remove(start, end, firstNode);
    }
    function remove(start, end, firstNode) {
        end = firstNode || end;
        const next = start.nextSibling;
        // next 可能已经被 remove。
        if (!next || next === end)
            return;
        // 调用元素的卸载钩子
        invokeElementUnmountedHooks(next);
        // 调用组件的卸载钩子
        invokeUnmountedHooks(next);
        removeChild(next);
        remove(start, end, firstNode);
    }
    function invokeUnmountedHooks(node) {
        destroy(node[LIFECYCLE_KEYS.unmounted], LIFECYCLE_KEYS.unmounted, callUnmounted);
    }
    function invokeElementUnmountedHooks(node) {
        destroy(node[LIFECYCLE_KEYS.elementUnmounted], LIFECYCLE_KEYS.elementUnmounted, callElementUnmounted);
    }

    const isDynamicOfComponentCssRule = {};
    const stackGroupId = [];
    let isKeyFrames = false;
    function addCssRule(selector, style) {
        const componentId = getCurrentCid();
        if ( !componentId) {
            return logError('addCssRule 函数只能在组件中使用，若要设置全局样式请使用普通 css');
        }
        const cssRuleId = getComponentCssRuleId(componentId, stackGroupId);
        incrementComponentCssRuleId(componentId);
        const isDynamicObj = getCurrentIsDynamicObject(componentId);
        const isDynamicVar = isDynamicObj.hasOwnProperty(cssRuleId)
            ? isDynamicObj[cssRuleId]
            : (isDynamicObj[cssRuleId] = isDynamic(style));
        // 有可能是嵌套 group，比如嵌套的 @media
        stackGroupId.reduce((id, current) => {
            const result = id ? `${id}-${current}` : current;
            isDynamicObj[result] || (isDynamicObj[result] = isDynamicVar);
            return result;
        }, '');
        if (isDynamicVar) {
            setHasDynamic(true);
            selector = addScopeForSelector(selector, getCurrentDsid());
            const cssRule = createCssRule(selector, '{}', componentId);
            if (cssRule) {
                setCssRule(cssRule, style);
                onUnmounted(() => deleteCssRule(cssRule));
            }
        }
        else {
            // 静态样式只需要生成一次就行了，相同组件的不同实例
            // 共享相同的静态样式。
            // keyframes 情况比较特殊，因为需要包含所有子 rule
            // 才有意义。
            if (getComponentInstanceCount(componentId) >= 1 && !isKeyFrames) {
                return;
            }
            setHasStatic(true);
            selector = addScopeForSelector(selector, componentId);
            createCssRule(selector, `{${stringifyStyle(style)}}`, componentId);
        }
    }
    function keyframes$1(block) {
        const componentId = getCurrentCid();
        if ( !componentId) {
            return logError('keyframes 函数只能在组件中使用，若要设置全局样式请使用普通 css');
        }
        let result = '';
        const cssKeyframesRuleId = getComponentCssRuleId(componentId, stackGroupId);
        setComponentCssRuleId(componentId, 0);
        stackGroupId.push(cssKeyframesRuleId);
        const isDynamicObj = getCurrentIsDynamicObject(componentId);
        const firstName = `f-${componentId}-${cssKeyframesRuleId}`;
        isKeyFrames = true;
        if (isDynamicObj.hasOwnProperty(cssKeyframesRuleId)) {
            if (isDynamicObj[cssKeyframesRuleId])
                result = keyframes(componentId, block);
            else
                result = firstName;
        }
        else {
            keyframes(componentId, block, firstName);
            result = firstName;
        }
        setComponentCssRuleId(componentId, stackGroupId.pop());
        incrementComponentCssRuleId(componentId);
        isKeyFrames = false;
        return result;
    }
    function media$1(condition, block) {
        const componentId = getCurrentCid();
        if ( !componentId) {
            return logError('media 函数只能在组件中使用，若要设置全局样式请使用普通 css');
        }
        const cssMediaRuleId = getComponentCssRuleId(componentId, stackGroupId);
        setComponentCssRuleId(componentId, 0);
        stackGroupId.push(cssMediaRuleId);
        const isDynamicObj = getCurrentIsDynamicObject(componentId);
        if (isDynamicObj.hasOwnProperty(cssMediaRuleId)) {
            isDynamicObj[cssMediaRuleId] &&
                media(componentId, condition, block);
        }
        else {
            media(componentId, condition, block);
        }
        setComponentCssRuleId(componentId, stackGroupId.pop());
        incrementComponentCssRuleId(componentId);
    }
    function getCurrentIsDynamicObject(componentId) {
        return (isDynamicOfComponentCssRule[componentId] ||
            (isDynamicOfComponentCssRule[componentId] = {}));
    }
    function isDynamic(style) {
        const keys = Object.keys(style);
        for (let i = 0; i < keys.length; i++) {
            if (isFunction(style[keys[i]])) {
                return true;
            }
        }
        return false;
    }
    function setCssRule(cssRule, style) {
        const cssRuleStyle = cssRule.style;
        Object.keys(style).forEach((key) => {
            const value = style[key];
            if (!value)
                return;
            if (isFunction(value)) {
                autoUpdate(() => (cssRuleStyle[key] = value()));
            }
            else {
                cssRuleStyle[key] = value;
            }
        });
    }
    function deleteCssRule(cssRule) {
        while (cssRule.parentRule) {
            cssRule = cssRule.parentRule;
        }
        const styleSheet = cssRule.parentStyleSheet;
        if (styleSheet) {
            styleSheet.deleteRule(getIndex(cssRule, styleSheet.cssRules));
        }
    }
    function getIndex(cssRule, cssRules) {
        let lenght = cssRules.length;
        while (lenght--) {
            if (cssRules[lenght] === cssRule) {
                return lenght;
            }
        }
        return -1;
    }

    exports.$div = $div;
    exports.$span = $span;
    exports.block = block;
    exports.computed = computed;
    exports.defineComponent = defineComponent;
    exports.div = div;
    exports.effect = effect;
    exports.hAttr = hAttr;
    exports.hClass = hClass;
    exports.hComment = hComment;
    exports.hId = hId;
    exports.hOn = hOn;
    exports.hProp = hProp;
    exports.hShow = hShow;
    exports.hSlot = hSlot;
    exports.hStyle = hStyle;
    exports.hText = hText;
    exports.isReactive = isReactive;
    exports.keyframes = keyframes$1;
    exports.media = media$1;
    exports.mount = mount$1;
    exports.nextTick = nextTick;
    exports.onElementUnmounted = onElementUnmounted;
    exports.onMounted = onMounted;
    exports.onUnmounted = onUnmounted;
    exports.onUpdated = onUpdated;
    exports.reactive = reactive;
    exports.s = addCssRule;
    exports.span = span;
    exports.stop = stop;

    Object.defineProperty(exports, '__esModule', { value: true });

    return exports;

}({}));
