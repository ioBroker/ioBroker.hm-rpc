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
                return new Promise(async resolve => {
                    const harness = getHarness();

                    // change the adapter config
                    harness._objects.getObject('system.adapter.hm-rpc.0', (err, obj) => {
                        obj.native.homematicAddress = '127.0.0.1';
                        obj.native.homematicPort = 2010;
                        harness._objects.setObject(obj._id, obj);

                        harness.startAdapterAndWait().then(() => {
                            harness.on('objectChange', (obj) => {
                                if (obj === 'hm-rpc.0.000393C98D0FF5.1.SET_POINT_TEMPERATURE') {
                                    console.log('hm-rpc.0.000393C98D0FF5.1.SET_POINT_TEMPERATURE changed!');
                                    resolve();
                                }
                            });
                        });
                    });
                });
            });
        }); */
    } // endDefineAdditionalTests
});
