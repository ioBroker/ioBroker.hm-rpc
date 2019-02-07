'use strict';

const path = require('path');
const {tests} = require('@iobroker/testing');

// You can also mock external modules to create a more controlled environment during testing.
// Define the mocks as objects and include them below
const nobleMock = {
    on() {
    },
    state: 'poweredOff',
};

// Run tests
tests.unit(path.join(__dirname, '..'), {
    //     ~~~~~~~~~~~~~~~~~~~~~~~~~
    // This should be the adapter's root directory

    // If the adapter may call process.exit during startup, define here which exit codes are allowed.
    // By default, 0 is ok. Providing this option overrides the default.
    // Make sure to include 0 if other exit codes are allowed aswell.
    allowedExitCodes: [11],

    // optionally define which modules should be mocked.
    additionalMockedModules: {
        'noble': nobleMock,
        '@abandonware/noble': nobleMock,
    }
});