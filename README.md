![Logo](admin/homematic.png)
# ioBroker HomeMatic RPC Adapter

![Build Status](https://github.com/ioBroker/ioBroker.hm-rpc/workflows/Test%20and%20Release/badge.svg)
![Number of Installations](http://iobroker.live/badges/hm-rpc-installed.svg) 
![Number of Installations](http://iobroker.live/badges/hm-rpc-stable.svg) 
[![NPM version](http://img.shields.io/npm/v/iobroker.hm-rpc.svg)](https://www.npmjs.com/package/iobroker.hm-rpc)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hm-rpc.svg)](https://www.npmjs.com/package/iobroker.hm-rpc)

[![NPM](https://nodei.co/npm/iobroker.hm-rpc.png?downloads=true)](https://nodei.co/npm/iobroker.hm-rpc/)

Connects HomeMatic Interface-Processes (BidCos-Services, Homegear and CUxD) via XML-RPC or BIN-RPC to ioBroker

**This adapter uses the service [Sentry.io](https://sentry.io) to automatically report exceptions and code errors and new device schemas to me as the developer.** More details see below!

## What is Sentry.io and what is reported to the servers of that company?
Sentry.io is a service for developers to get an overview about errors from their applications. Exactly this is implemented in this adapter.

When the adapter crashes or another Code error happens, this error message that also appears in the ioBroker log is submitted to Sentry. 
When you have allowed ioBroker GmbH to collect diagnostic data, then also your installation ID (this is just a unique ID **without** any additional infos about you, email, name or such) is included. This allows Sentry to group errors and show how many unique users are affected by such an error. All of these helps me to provide error-free adapters that basically never crash.

## Configuration

### HomeMatic Address
*Homematic Address* is the IP of the HomeMatic CCU respectively the Host that is running the BidCos-Service(s).
CCU IP address.

### HomeMatic Port
CCU Port.

Usually:
- 2001 for wireless devices (https: 42001),
- 2000 for wired devices (https: 42000),
- 8701 for CUxD daemon,
- 2010 for Homematic IP devices (https: 42010)
- 9292 for Virtual Devices (https: 49292)

### Daemon
CCU/Homematic can support different types of devices (wired, wireless, HM-IP, CUxD), and for every type you should create the instance of adapter separately.

### Protocol
There are two protocols for communication XML-RPC and BIN-RPC. BIN-RPC is faster, but it can be, that the end device does not support it or supports it incorrect.
In this case, switch the protocol to XML.

*Notice:* CUxD can only communicate with BIN-RPC and HM-IP and RFD only via XML-RPC protocol.

### Synchronize objects (once)
After very first start the instance read *all* devices from CCU/Homematic.
If you changed the configuration (renamed devices, added or removed devices) you can synchronise the configuration in ioBroker by enabling this option.

The instance will be restarted immediately, synchronize all devices anew and deactivate this option itself.

### Adapter Address
This address has to be the IP under which the host that is running the adapter itself is reachable.
This address is used by the CCU to connect to the adapter.
This address cannot be `0.0.0.0`, because CCU/Homematic cannot reach ioBroker under "0.0.0.0" IP address.

### Adapter port
The port number on which the ioBroker will run. Let it 0 for automatic selection.

### Adapter Callback Address
Sometimes the ioBroker server runs behind the router, to solve this problem (that inbound and outbound addresses are different), this option can be used.
Here you can define the IP address of the router, and the router will route the traffic to ioBroker according to the port.

In case of a docker instance, you can write here directly the IP address of the host of the docker.
It is also important to route the adapter port (next to adapter address) into the docker container. You can choose there an arbitrary port (e.g., 12001, 12010).

Used if ioBroker runs in Docker.

### Check communication interval(sec)
Send pings to CCU/Homematic with such intervall.

### Reconnect interval (sec)
How many seconds will be waited before connect attempts.

### Don't delete devices on adapter start
If this flag is not activated, the ioBroker will remove devices from configuration if a device is not found at adapter start in CCU/Homematic.
Activate this flag to do *not* delete such a devices. This is to avoid a bug on CCU side, where HM-IP devices are not correctly transmitted to
ioBroker and thus will be deleted on the adapter start and be recreated when transmitted, some milliseconds later. The flag is automatically checked
when you select HM-IP as daemon. However, when you delete devices while the adapter is running, the adapter will be notified by CCU and will remove devices 
which are removed on CCU.

### Use https
If this flag is activated, the connection will be established via https instead of http.
This only works with XML-RPC protocol.

### Username and password
If 'use https' is activated, you can fill in the username and password of a CCU user.
In case the CCU needs authentication on the API, you have to provide the credentials here.

## Custom commands
It is possible to send custom commands, e.g., to read and control the master area of a device which allows the user 
to configure heating week programs and more.

This is done by sending a message to the adapter, which contains the method as first parameter, followed by an object which 
has to contain the ``ID`` of the target device as well as optional the ``paramType``, which specifies e.g. the MASTER area.
Additional parameters have to be sent in the ``params`` object.

**Examples:**

Log all values of the MASTER area of a device:
```javascript
sendTo('hm-rpc.0', 'getParamset', {ID: 'OEQ1861203', paramType: 'MASTER'}, res => {
    log(JSON.stringify(res));
});
```
Set an attribute of the MASTER area to a specific value:
```javascript
sendTo('hm-rpc.0', 'putParamset', {ID: 'OEQ1861203', paramType: 'MASTER', params: {'ENDTIME_FRIDAY_1': 700}}, res => {
    log(JSON.stringify(res));
});
```

List all devices:
```javascript
sendTo('hm-rpc.0', 'listDevices', {}, res => {
    log(JSON.stringify(res));
});
```

Set a value, like the adapter does on `stateChange`:
```javascript
sendTo('hm-rpc.1', 'setValue', {ID: '000453D77B9EDF:1', paramType: 'SET_POINT_TEMPERATURE', params: 15}, res => {
    log(JSON.stringify(res));
});
```

Get the `paramsetDescription` of a device's channel:
```javascript
sendTo('hm-rpc.1', 'getParamsetDescription', {ID: '000453D77B9EDF:1', paramType: 'VALUES'}, res => {
    log(JSON.stringify(res));
});
```

Get firmware information of a device (in this case, we are logging the FW status):
```javascript
sendTo('hm-rpc.1', 'getDeviceDescription', {ID: '0000S8179E3DBE', paramType: 'FIRMWARE'}, res => {
    if (!res.error) {
        log(`FW status: ${res.result.FIRMWARE_UPDATE_STATE}`)
    } else {
        log(res.error)
    }
});
```

## Additional information
If you use HomeMatic switches or remotes, their button states will only be acknowledged by CCU and thus 
by ioBroker when you have a running 'dummy' program on the CCU which depends on the related switch or remote.

You can use a single dummy program for multiple buttons, by just adding all button states in the if-clause connected 
via or/and operator. The then-clause of the program can remain empty. Now your state should be updated on a button press.

## Development
To update all available images execute `npm run update-images`

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**
* (bluefox) Updated packages
* (bluefox) Removed support of Node.js 16

### 1.17.0 (2024-03-18)
* (klein0r) Fixed encrypted configuration

### 1.16.1 (2024-03-05)
* (bluefox) Improved the configuration layout

### 1.16.0 (2023-12-25)
* (JeyCee) Added support for the device manager
* (bluefox) Added JSON config
* (foxriver76) port to adapters internal `setTimeout/setInterval` methods

### 1.15.19 (2023-08-08)
* (bluefox) Updated packages

### 1.15.18 (2023-05-08)
* (foxriver76) no longer support EOL versions, please upgrade to node 16

### Older entries
[here](OLD_CHANGELOG.md)

## License

The MIT License (MIT)

Copyright (c) 2014-2024 bluefox <dogafox@gmail.com>

Copyright (c) 2014 hobbyquaker

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
