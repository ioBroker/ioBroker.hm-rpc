'use strict';
const path = require('path');
const {tests} = require('@iobroker/testing');

// Run tests
tests.unit(path.join(__dirname, '..'), {
    defineMockBehavior(db, adapter) {
        adapter.getObjectView.returns({rows: []});
    }
});
