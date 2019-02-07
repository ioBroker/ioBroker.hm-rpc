'use strict';

const path = require('path');
const {tests} = require('@iobroker/testing');

// Run tests
tests.packageFiles(path.join(__dirname, '..'));