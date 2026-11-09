/**
 * What the tests of the openccu-lite mode share: a fake system (occulite-client's FakeBox) with one HmIP device,
 * its paramset descriptions, values and metadata, and the adapter mock of `@iobroker/testing` completed with the
 * methods of the real adapter it lacks.
 */

import { utils, type MockAdapter, type MockDatabase } from '@iobroker/testing';
import type { FakeBox, FakeBoxOptions } from 'occulite-client/testing';

export const IFACE = 'HmIP-RF';
export const DEVICE = '0001D8A99B0815';
export const TOKEN = 'olt_test_token';

/** The device of the fake system: a switch actuator with the maintenance channel and one switch channel */
export const DEVICES: Record<string, unknown>[] = [
    {
        ADDRESS: DEVICE,
        TYPE: 'HmIP-PS',
        VERSION: 1,
        FIRMWARE: '2.6.2',
        CHILDREN: [`${DEVICE}:0`, `${DEVICE}:1`],
        PARAMSETS: ['MASTER'],
        FIRMWARE_UPDATE_STATE: 'UP_TO_DATE',
    },
    {
        ADDRESS: `${DEVICE}:0`,
        TYPE: 'MAINTENANCE',
        PARENT: DEVICE,
        PARENT_TYPE: 'HmIP-PS',
        VERSION: 1,
        PARAMSETS: ['MASTER', 'VALUES'],
    },
    {
        ADDRESS: `${DEVICE}:1`,
        TYPE: 'SWITCH_VIRTUAL_RECEIVER',
        PARENT: DEVICE,
        PARENT_TYPE: 'HmIP-PS',
        VERSION: 1,
        PARAMSETS: ['MASTER', 'VALUES'],
    },
];

export const DESCRIPTIONS: FakeBoxOptions['descriptions'] = {
    [`${IFACE}.${DEVICE}:0`]: {
        UNREACH: { TYPE: 'BOOL', OPERATIONS: 5 },
        LOW_BAT: { TYPE: 'BOOL', OPERATIONS: 5 },
        RSSI_DEVICE: { TYPE: 'INTEGER', OPERATIONS: 5 },
    },
    [`${IFACE}.${DEVICE}:1`]: {
        STATE: { TYPE: 'BOOL', OPERATIONS: 7 },
        LEVEL: { TYPE: 'FLOAT', OPERATIONS: 7 },
    },
};

export const VALUES: FakeBoxOptions['values'] = {
    [`${IFACE}.${DEVICE}:1.STATE`]: { value: true, confirmed: true },
    [`${IFACE}.${DEVICE}:0.UNREACH`]: { value: false, confirmed: true },
    [`${IFACE}.${DEVICE}:0.LOW_BAT`]: { value: false, confirmed: false },
};

/** The names and rooms of the fake system: the device named, the switch channel in a room and a function */
export function metaDocument(): NonNullable<FakeBoxOptions['meta']> {
    return {
        revision: 3,
        objects: {
            [`${IFACE}.${DEVICE}`]: { name: 'Stehlampe' },
            [`${IFACE}.${DEVICE}:1`]: { name: 'Stehlampe Schalter', enums: ['room/eg/wohnzimmer', 'function/licht'] },
        },
        enums: {
            room: {
                name: { de: 'Räume', en: 'Rooms' },
                tree: [
                    {
                        id: 'eg',
                        name: { de: 'Erdgeschoss', en: 'Ground floor' },
                        children: [{ id: 'wohnzimmer', name: { de: 'Wohnzimmer', en: 'Living room' } }],
                    },
                    {
                        id: 'og',
                        name: { de: 'Obergeschoss', en: 'Upper floor' },
                        children: [{ id: 'bad', name: 'Bad' }],
                    },
                ],
            },
            function: {
                name: { de: 'Gewerke', en: 'Functions' },
                tree: [{ id: 'licht', name: { de: 'Licht', en: 'Light' } }],
            },
        },
    };
}

/** A fake system with the device above; `opts` overrides */
export async function startFakeBox(opts: FakeBoxOptions = {}): Promise<FakeBox> {
    const { FakeBox } = await import('occulite-client/testing');
    const box = new FakeBox({
        token: TOKEN,
        interfaces: [IFACE],
        devices: { [IFACE]: structuredClone(DEVICES) },
        descriptions: DESCRIPTIONS,
        values: structuredClone(VALUES),
        meta: metaDocument(),
        ...opts,
    });
    await box.start();
    return box;
}

/** The timers an adapter mock started, cleared by `stopTimers` */
const timers = new Set<NodeJS.Timeout>();

/**
 * The adapter mock of `@iobroker/testing`, completed with what the real adapter has and the mock lacks: the timer
 * helpers, `delay`, `restart`, `version`, `host`, the promise variants of `delObject` and `delForeignObject` (with
 * `recursive`), `setObjectAsync` without the mock's rewrite of the object's `_id`, the object views of the adapter and
 * `getForeignObjectsAsync` with a type filter for every object type (the mock's knows state, channel and device only,
 * so it never finds an enum)
 *
 * @param adapter the mock
 * @param db the mock database
 */
export function completeAdapterMock(adapter: MockAdapter, db: MockDatabase): MockAdapter {
    const a = adapter as any;
    a.version = '4.3.0';
    a.host = 'testhost';
    a.delForeignObjectAsync = (id: string) => {
        db.deleteObject(id);
        return Promise.resolve();
    };
    a.delObjectAsync = (id: string, options?: { recursive?: boolean }) => {
        const full = id.startsWith(`${a.namespace}.`) ? id : `${a.namespace}.${id}`;
        for (const key of [...db.objects.keys()]) {
            if (key === full || (options?.recursive && key.startsWith(`${full}.`))) {
                db.deleteObject(key);
            }
        }
        return Promise.resolve();
    };
    // the mock's setObject rewrites the passed object's _id to the full id; js-controller leaves the object alone,
    // and the adapter keys its dpTypes by the relative _id afterwards
    a.setObjectAsync = (id: string, obj: ioBroker.SettableObject) => {
        const full = id.startsWith(`${a.namespace}.`) ? id : `${a.namespace}.${id}`;
        db.publishObject({ ...structuredClone(obj), _id: full } as ioBroker.Object);
        return Promise.resolve({ id: full });
    };
    // the object views of the adapter (the promisified variant does not see a stubbed getObjectView)
    a.getObjectViewAsync = (design: string, search: string, params: { startkey: string; endkey: string }) =>
        Promise.resolve(objectView(db)(design, search, params));
    a.getForeignObjectsAsync = (pattern: string, type?: string) =>
        Promise.resolve(
            Object.fromEntries(Object.entries(db.getObjects(pattern)).filter(([, obj]) => !type || obj.type === type)),
        );
    a.setTimeout = (cb: () => void, ms: number) => {
        const t = setTimeout(() => {
            timers.delete(t);
            cb();
        }, ms);
        timers.add(t);
        return t;
    };
    a.clearTimeout = (t: NodeJS.Timeout) => {
        timers.delete(t);
        clearTimeout(t);
    };
    a.setInterval = (cb: () => void, ms: number) => {
        const t = setInterval(cb, ms);
        timers.add(t);
        return t;
    };
    a.clearInterval = (t: NodeJS.Timeout) => {
        timers.delete(t);
        clearInterval(t);
    };
    a.delay = (ms: number) => new Promise(res => setTimeout(res, ms));
    a.restartCalls = 0;
    a.restart = () => {
        a.restartCalls++;
    };
    return adapter;
}

/** Clears every timer the mocks started, so mocha ends */
export function stopTimers(): void {
    for (const t of timers) {
        clearTimeout(t);
        clearInterval(t);
    }
    timers.clear();
}

/**
 * The object views the adapter uses, over the mock database: `hm-rpc/listDevices` (the design view of io-package.json)
 * and `system/state`
 *
 * @param db the mock database
 */
export function objectView(
    db: MockDatabase,
): (
    design: string,
    search: string,
    params: { startkey: string; endkey: string },
) => { rows: { id: string; value: any }[] } {
    return (design: string, search: string, params: { startkey: string; endkey: string }) => {
        const rows: { id: string; value: any }[] = [];
        for (const [id, obj] of db.objects) {
            if (id < params.startkey || id > params.endkey) {
                continue;
            }
            if (design === 'hm-rpc' && search === 'listDevices') {
                if (/^hm-rpc\.[0-9]+\.\*?[A-Za-z0-9_-]+(\.[0-9]+)?$/.test(id)) {
                    rows.push({
                        id,
                        value: {
                            ADDRESS: obj.native ? obj.native.ADDRESS : '',
                            VERSION: obj.native ? obj.native.VERSION : '',
                        },
                    });
                }
            } else if (design === 'system' && search === 'state') {
                if (obj.type === 'state') {
                    rows.push({ id, value: obj });
                }
            }
        }
        return { rows };
    };
}

/** A mock adapter and database for the names tests */
export function createMocks(config: Record<string, unknown> = {}): { adapter: MockAdapter; database: MockDatabase } {
    const mocks = utils.unit.createMocks({ name: 'hm-rpc', config: config as any });
    completeAdapterMock(mocks.adapter, mocks.database);
    return mocks;
}

/** The address fields of the instance configuration for a URL (the fake system's) */
export function liteUrlPartsOf(url: string): { homematicAddress: string; homematicPort: string; useHttps: boolean } {
    const parsed = new URL(url);
    return {
        homematicAddress: parsed.hostname,
        homematicPort: parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
        useHttps: parsed.protocol === 'https:',
    };
}

/** Waits until `check` is true, at most `ms` */
export async function waitFor(check: () => boolean, ms = 3000, what = 'condition'): Promise<void> {
    const end = Date.now() + ms;
    while (!check()) {
        if (Date.now() > end) {
            throw new Error(`timeout waiting for ${what}`);
        }
        await new Promise(res => setTimeout(res, 20));
    }
}
