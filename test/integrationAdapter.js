'use strict';

const path = require('path');
const {tests} = require('@iobroker/testing');
//const hmSim = require('hm-simulator');

// Run tests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests(getHarness) {
        describe('Test sendTo()', () => {
            it('Should work', () => {
                return new Promise(async resolve => {
                    // Create a fresh harness instance each test!
                    const harness = getHarness();
                    // Start the adapter and wait until it has started
                    await harness.startAdapterAndWait();
                    harness.sendTo('hm-rpc.0', 'test', 'message', (resp) => {
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
                        harness.on('objectChange', obj => {
                            if (obj === 'hm-rpc.0.000393C98D0FF5.1.SET_POINT_TEMPERATURE') {
                                console.log('object hm-rpc.0.000393C98D0FF5.1.SET_POINT_TEMPERATURE changed!');
                                resolve();
                            } // endIf
                        });
                    });
                });
            });
        });

        describe('Test roles', () => {
            it('Should work', () => {
                return new Promise(resolve => {
                    const harness = getHarness();

                    // change the adapter config
                    harness._objects.getObject('system.adapter.hm-rpc.0', async (err, obj) => {
                        obj.native.homematicAddress = '127.0.0.1';
                        obj.native.homematicPort = 2010;
                        harness._objects.setObject(obj._id, obj);

                        await harness.startAdapterAndWait();

                        harness.on('objectChange', obj => {
                            if (obj === 'hm-rpc.0.000213C990986A.1.PRESS_SHORT') {
                                // object has been created, now check role
                                harness._objects.getObject(obj, (err, testObj) => {
                                    if (testObj.common.role === 'button') {
                                        resolve();
                                    } // endIf
                                });
                            } // endIf
                        });
                    });
                });
            });
        }); */
    } // endDefineAdditionalTests
});
