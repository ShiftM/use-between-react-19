import * as React from 'react';
import { useEffect, useReducer, useRef } from 'react';

const ReactSharedInternals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
const ReactCurrentDispatcher = ReactSharedInternals.H;

const useForceUpdate = () => useReducer(() => ({}))[1];

const notImplemented = (name) => () => {
    const msg = `Hook "${name}" no possible to using inside useBetween scope.`;
    console.error(msg);
    throw new Error(msg);
};
const equals = (a, b) => Object.is(a, b);
const shouldUpdate = (a, b) => ((!a || !b) ||
    (a.length !== b.length) ||
    a.some((dep, index) => !equals(dep, b[index])));
const detectServer = () => typeof window === 'undefined';
const instances = new Map();
let boxes = [];
let pointer = 0;
let useEffectQueue = [];
let useLayoutEffectQueue = [];
let nextTick = () => { };
let isServer = detectServer();
let initialData = undefined;
const nextBox = () => {
    const index = pointer++;
    return (boxes[index] = boxes[index] || {});
};
const ownDisptacher = {
    useState(initialState) {
        const box = nextBox();
        const tick = nextTick;
    
        if (!box.initialized) {
            const safeState = typeof initialState === "function" ? initialState() : initialState;
    
            // Fallback for undefined initialState
            box.state = safeState ?? {}; // Change to [] if you're expecting an array
    
            box.set = (fnOrValue) => {
                const nextValue = typeof fnOrValue === "function" ? fnOrValue(box.state) : fnOrValue;
                if (!equals(nextValue, box.state)) {
                    box.state = nextValue;
                    tick();
                }
            };
    
            box.initialized = true;
        }
    
        // Always return stable Proxy for destructuring safety
        return new Proxy([box.state, box.set], {
            get(_, prop) {
                if (prop === 0) return box.state;
                if (prop === 1) return box.set;
                return undefined;
            },
            set() {
                return false;
            }
        });
    },
    useReducer(reducer, initialState, init) {
        const box = nextBox();
        const tick = nextTick;
        if (!box.initialized) {
            box.state = init ? init(initialState) : initialState;
            box.dispatch = (action) => {
                const state = reducer(box.state, action);
                if (!equals(state, box.state)) {
                    box.state = state;
                    tick();
                }
            };
            box.initialized = true;
        }
        return [box.state, box.dispatch];
    },
    useEffect(fn, deps) {
        if (isServer)
            return;
        const box = nextBox();
        if (!box.initialized) {
            box.deps = deps;
            box.initialized = true;
            useEffectQueue.push([box, deps, fn]);
        }
        else if (shouldUpdate(box.deps, deps)) {
            box.deps = deps;
            useEffectQueue.push([box, deps, fn]);
        }
    },
    useLayoutEffect(fn, deps) {
        if (isServer)
            return;
        const box = nextBox();
        if (!box.initialized) {
            box.deps = deps;
            box.initialized = true;
            useLayoutEffectQueue.push([box, deps, fn]);
        }
        else if (shouldUpdate(box.deps, deps)) {
            box.deps = deps;
            useLayoutEffectQueue.push([box, deps, fn]);
        }
    },
    useCallback(fn, deps) {
        const box = nextBox();
        if (!box.initialized) {
            box.fn = fn;
            box.deps = deps;
            box.initialized = true;
        }
        else if (shouldUpdate(box.deps, deps)) {
            box.deps = deps;
            box.fn = fn;
        }
        return box.fn;
    },
    useMemo(fn, deps) {
        const box = nextBox();
        if (!box.initialized) {
            box.deps = deps;
            box.state = fn();
            box.initialized = true;
        }
        else if (shouldUpdate(box.deps, deps)) {
            box.deps = deps;
            box.state = fn();
        }
        return box.state;
    },
    useRef(initialValue) {
        const box = nextBox();

        if (!box.initialized) {
            // Always initialize current to a fallback proxy
            const fallback = new Proxy(
                { current: initialValue ?? {} },
                {
                    get(target, prop) {
                        if (prop === 'current') return target.current;
                        return undefined;
                    },
                    set(target, prop, value) {
                        if (prop === 'current') {
                            target.current = value ?? {};
                        }
                        return true;
                    },
                }
            );

            box.state = fallback;
            box.initialized = true;
        }

        return box.state;
    },
    useImperativeHandle(ref, fn, deps) {
        if (isServer)
            return;
        const box = nextBox();
        if (!box.initialized) {
            box.deps = deps;
            box.initialized = true;
            useLayoutEffectQueue.push([box, deps, () => {
                typeof ref === 'function' ? ref(fn()) : ref.current = fn();
            }]);
        }
        else if (shouldUpdate(box.deps, deps)) {
            box.deps = deps;
            useLayoutEffectQueue.push([box, deps, () => {
                typeof ref === 'function' ? ref(fn()) : ref.current = fn();
            }]);
        }
    }
};
[
    'readContext',
    'useContext',
    'useDebugValue',
    'useResponder',
    'useDeferredValue',
    'useTransition'
].forEach(key => ownDisptacher[key] = notImplemented(key));
const factory = (hook, options) => {
    const scopedBoxes = [];
    let syncs = [];
    let state = undefined;
    let unsubs = [];
    let mocked = false;
    if (options && options.mock) {
        state = options.mock;
        mocked = true;
    }
    const sync = () => {
        syncs.slice().forEach(fn => fn());
    };
    const tick = () => {
        if (mocked)
            return;
        const originDispatcher = ReactCurrentDispatcher.current;
        const originState = [
            pointer,
            useEffectQueue,
            useLayoutEffectQueue,
            boxes,
            nextTick
        ];
        let tickAgain = false;
        let tickBody = true;
        pointer = 0;
        useEffectQueue = [];
        useLayoutEffectQueue = [];
        boxes = scopedBoxes;
        nextTick = () => {
            if (tickBody) {
                tickAgain = true;
            }
            else {
                tick();
            }
        };
        ReactCurrentDispatcher.current = ownDisptacher;
        state = hook(initialData);
        [useLayoutEffectQueue, useEffectQueue].forEach(queue => (queue.forEach(([box, deps, fn]) => {
            box.deps = deps;
            if (box.unsub) {
                const unsub = box.unsub;
                unsubs = unsubs.filter(fn => fn !== unsub);
                unsub();
            }
            const unsub = fn();
            if (typeof unsub === "function") {
                unsubs.push(unsub);
                box.unsub = unsub;
            }
            else {
                box.unsub = null;
            }
        })));
        [
            pointer,
            useEffectQueue,
            useLayoutEffectQueue,
            boxes,
            nextTick
        ] = originState;
        ReactCurrentDispatcher.current = originDispatcher;
        tickBody = false;
        if (!tickAgain) {
            sync();
            return;
        }
        tick();
    };
    const sub = (fn) => {
        if (syncs.indexOf(fn) === -1) {
            syncs.push(fn);
        }
    };
    const unsub = (fn) => {
        syncs = syncs.filter(f => f !== fn);
    };
    const mock = (obj) => {
        mocked = true;
        state = obj;
        sync();
    };
    const unmock = () => {
        mocked = false;
        tick();
    };
    return {
        init: () => tick(),
        get: () => state,
        sub,
        unsub,
        unsubs: () => unsubs,
        mock,
        unmock
    };
};
const getInstance = (hook) => {
    let inst = instances.get(hook);
    if (!inst) {
        inst = factory(hook);
        instances.set(hook, inst);
        inst.init();
    }
    return inst;
};
const useBetween = (hook) => {
    const forceUpdate = useForceUpdate();
    let inst = getInstance(hook);
    inst.sub(forceUpdate);
    useEffect(() => (inst.sub(forceUpdate), () => inst.unsub(forceUpdate)), [inst, forceUpdate]);
    return inst.get();
};
const useInitial = (data, server) => {
    const ref = useRef();
    if (!ref.current) {
        isServer = typeof server === 'undefined' ? detectServer() : server;
        isServer && clear();
        initialData = data;
        ref.current = 1;
    }
};
const mock = (hook, state) => {
    let inst = instances.get(hook);
    if (inst)
        inst.mock(state);
    else {
        inst = factory(hook, { mock: state });
        instances.set(hook, inst);
    }
    return inst.unmock;
};
const get = (hook) => getInstance(hook).get();
const free = function (...hooks) {
    if (!hooks.length) {
        hooks = [];
        instances.forEach((_instance, hook) => hooks.push(hook));
    }
    let inst;
    hooks.forEach((hook) => ((inst = instances.get(hook)) &&
        inst.unsubs().slice().forEach((fn) => fn())));
    hooks.forEach((hook) => instances.delete(hook));
};
const clear = () => instances.clear();
const on = (hook, fn) => {
    const inst = getInstance(hook);
    const listener = () => fn(inst.get());
    inst.sub(listener);
    return () => inst.unsub(listener);
};

export { clear, free, get, mock, on, useBetween, useInitial };
