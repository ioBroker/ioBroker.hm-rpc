'use strict';

const path = require('path');
const {tests} = require('@iobroker/testing');

// Run tests
tests.integration(path.join(__dirname, '..'), {
    //            ~~~~~~~~~~~~~~~~~~~~~~~~~
    // This should be the adapter's root directory

    // If the adapter may call process.exit during startup, define here which exit codes are allowed.
    // By default, termination during startup is not allowed.
    allowedExitCodes: [11],

    defineAdditionalTests(getHarness) {

        describe('Test sendTo()', () => {

            it('Should work', () => {
                return new Promise(resolve => {
                    // Create a fresh harness instance each test!
                    const harness = getHarness();
                    // Start the adapter and wait until it has started
                    harness.startAdapterAndWait.then(() => {

                        harness.sendTo('hm-rpc.0', 'test', 'message', (resp) => {
                            console.dir(resp);
                            resolve();
                        });
                    });
                });
            });

        });
    }
});