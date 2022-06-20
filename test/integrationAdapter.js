'use strict';

const path = require('path');
const { tests } = require('@iobroker/testing');
// TODO: activate after https://github.com/hobbyquaker/hm-simulator/pull/1
// const hmSim = require('hm-simulator');

// Run tests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test sendTo()', getHarness => {
            let harness;
            before(() => {
                harness = getHarness();
            });

            // eslint-disable-next-line no-undef
            it('Should work', async () => {
                // Start the adapter and wait until it has started
                await harness.startAdapterAndWait();
                return new Promise(resolve => {
                    harness.sendTo('hm-rpc.0', 'test', 'message', resp => {
                        console.dir(resp);
                        resolve();
                    });
                });
            });
        });

        // We can use it again if https://github.com/hobbyquaker/hm-simulator/pull/1 is merged or fixed in another way
        /*
        describe('Test connection', () => {
            it('Should work', () => {
                return new Promise(resolve => {
                    const harness = getHarness();

                    // change the adapter config
                    harness._objects.getObject('system.adapter.hm-rpc.0', async (err, obj) => {
                        obj.native.homematicAddress = '127.0.0.1';
                        obj.native.homematicPort = 2010;
                        harness._objects.setObject(obj._id, obj);

                        await harness.startAdapterAndWait();
                        harness.on('objectChange', id => {
                            if (id.startsWith('hm-rpc.0')) {
                                console.log(`object ${id} changed!`);
                                resolve();
                            } else {
                                console.warn(`objectChange: ${id}`);
                            }
                        });
                    });
                });
            });
        });

        describe('Test roles', () => {
            it('Should work', () => {
                return new Promise((resolve, reject) => {
                    const harness = getHarness();

                    // change the adapter config
                    harness._objects.getObject('system.adapter.hm-rpc.0', async (err, obj) => {
                        obj.native.homematicAddress = '127.0.0.1';
                        obj.native.homematicPort = 2010;
                        harness._objects.setObject(obj._id, obj);

                        await harness.startAdapterAndWait();

                        harness.on('objectChange', (id, obj) => {
                            if (id === 'hm-rpc.0.000213C990986A.1.PRESS_SHORT') {
                                // object has been created, now check role
                                if (obj.common.role === 'button') {
                                    resolve();
                                } else {
                                    reject(new Error(`Expected "${obj.common.role}" to be "button"`));
                                }
                            } else {
                                console.log(`objectChange: ${id}`);
                            }
                        });
                    });
                });
            });
        });
         */
    } // endDefineAdditionalTests
});
