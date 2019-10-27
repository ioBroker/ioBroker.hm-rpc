![Logo](admin/homematic.png)
# ioBroker HomeMatic RPC Adapter

![Number of Installations](http://iobroker.live/badges/hm-rpc-installed.svg) 
![Number of Installations](http://iobroker.live/badges/hm-rpc-stable.svg) 
[![NPM version](http://img.shields.io/npm/v/iobroker.hm-rpc.svg)](https://www.npmjs.com/package/iobroker.hm-rpc)
[![Downloads](https://img.shields.io/npm/dm/iobroker.hm-rpc.svg)](https://www.npmjs.com/package/iobroker.hm-rpc)

[![NPM](https://nodei.co/npm/iobroker.hm-rpc.png?downloads=true)](https://nodei.co/npm/iobroker.hm-rpc/)

Connects HomeMatic Interface-Processes (BidCos-Services, Homegear and CUxD) via XML-RPC or BIN-RPC to ioBroker

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
CCU/Homematic can support different types of devices (wired, wireless, hmip, CUxD) and for every type you should create the instance of adapter separately.

### Protocol
There are two protocols for communication XML-RPC and BIN-RPC. BIN-RPC is faster, but it can be, that the end device do not support it or supports it incorrect.
In this case switch the protocol to XML.

*Notice:* CUxD can only communicate with BIN-RPC and HMIP and RFD only via XML-RPC protocol.

### Synchronize objects (once)
After very first start the instance read *all* devices from CCU/Homematic.
If you changed the configuration (rename devices, add or removed devices) you can synchronise the configuration in ioBroker by enabling this option.

The instance will be restarted immediately, synchronize all devices anew and deactivate this option itself.

### Adapter Address
This address has to be the IP under which the host that is running the adapter itself is reachable.
This address is used by the CCU to connect to the adapter.
This address cannot be "0.0.0.0", because CCU/Homematic cannot reach ioBroker under "0.0.0.0" IP address.

### Adapter port
The port number on which the ioBroker will run. Let it 0 for automatically selection.

### Adapter Callback Address
Sometimes the ioBroker server runs behind the router, to solve this problem, that inboud and outbound addresses are different, this option can be used.
Here you can define the IP address of the router and the router will according to the port route the traffic to ioBroker.

Used if ioBroker runs in Docker.

### Check communication interval(sec)
Send pings to CCU/Homematic with such intervall.

### Reconnect interval (sec)
How many seconds will be waited before connect attempts.

### Don't delete devices
If this flag is not activated, the ioBroker will remove devices from configuration of device is removed in CCU/Homematic.
Activate this flag to do *not* delete such a devices, e.g. if some devices was temporary removed on CCU/Homematic.

### Use https
If this flag is activated, the connection will be established via https instead http.
This only works with XML-RPC protocol.

### Username and password
If 'use https' is activated you can fill in the username and password of a CCU user.
In case the CCU needs authentication on the API, you have to provide the credentials here.

## Custom commands
It is possible to send custom commands, e. g. to read and control the master area of a device which allows the user 
to configure heating week programs and more.

This is done by sending a message to the adapter, which contains the method as first parameter, followed by an object which 
has to contain the ``ID`` of the target device as well as optional the ``paramType``, which specifies e. g. the MASTER area.
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

Set a value, like the adapter does on stateChange:
```javascript
sendTo('hm-rpc.1', 'setValue', {ID: '000453D77B9EDF:1', paramType: 'SET_POINT_TEMPERATURE', params: 15}, res => {
    log(JSON.stringify(res));
});
```

Get the paramsetDescription of a devices channel:
```javascript
sendTo('hm-rpc.1', 'getParamsetDescription', {ID: '000453D77B9EDF:1', paramType: 'VALUES'}, res => {
    log(JSON.stringify(res));
});
```

## Additional information
If you use HomeMatic switches or remotes their button states will only be acknowledged by CCU and thus 
by ioBroker, when you have a running 'dummy' program on the CCU which depends on the related switch or remote.

## Changelog
### 1.10.3 (2019-10-27)
* (foxriver76) fixed info channel

### 1.10.2 (2019-10-24)
* (foxriver76) replace min max values of hmip with correct numbers 

### 1.10.0 (2019-08-12)
* (foxriver76) new meta data handling procedure
* __js-controller >= 1.4.2 required__

### 1.9.17 (2019-08-04)
* (foxriver76) handle meta values with max 1.01 as 1

### 1.9.16 (2019-07-18)
* (foxriver76) no longer use adapter.objects if not necessary
* (foxriver76) added meta data

### 1.9.15 (2019-07-01)
* (foxriver76) added meta and icon for HB-UNI-Sen-CAP-MOIST
* (foxriver76) fix type of EPAPER_TONE to string

### 1.9.14 (2019-06-29)
* (foxriver76) small bug fix for HM-Dis-EP-WM55
* (foxriver76) catch async errors on bin-rpc connection

### 1.9.13 (2019-06-03)
* (foxriver76) fixed bug where some meta values where stored in the wrong index

### 1.9.12 (2019-05-27)
* (foxriver76) fix maintenance channel of HM-Dis-EP-WM55
* (foxriver76) meta data added

### 1.9.11 (2019-04-21)
* (foxriver76) create OPERATING_VOLTAGE with unit V
* (foxriver76) create RSSI_* with unit dBm

### 1.9.10 (2019-04-12)
* (foxriver76) fix meta
* (foxriver76) added new meta data

### 1.9.9 (2019-03-17)
* (foxriver76) window states are now role `value.window`

### 1.9.8 (2019-02-27)
* (foxriver76) fixes for epaper line and icon type
* (foxriver76) metas added

### 1.9.7 (2019-02-13)
* (foxriver76) added metas
* (foxriver76) when max is 1.005 then set max to 1

### 1.9.6 (2019-02-02)
* (foxriver76) fix meta for virtual devices

### 1.9.5 (2019-01-29)
* (foxriver76) ignore alarm states because handled by rega

### 1.9.4 (2019-01-26)
* (foxriver76) added image
* (foxriver76) removed homematic path from ui

### 1.9.3 (2019-01-25)
* (foxriver76) added meta data

### 1.9.2 (2019-01-14)
* (foxriver76) added chinese
* (foxriver76) minor optimizations

### 1.9.1 (2019-01-08)
* (foxriver76) fix compact mode

### 1.9.0 (2019-01-07)
* (foxriver76) adding custom commands to documentation and logging
* (Holuba & foxriver76) fixes for virtual devices API
* (bluefox) enabling compact mode
* (marvingrieger) adjusting HmIP shutters to a max value of 1

### 1.8.3 (2019-01-04)
* (foxriver76) fixing dependency

### 1.8.2 (2018-12-30)
* (foxriver76) Added meta information
* (foxriver76) Added new icons
* (foxriver76) Minor improvements

### 1.8.1 (2018-12-22)
* (foxriver76) Added a lot of meta information

### 1.8.0 (2018-11-27)
* (foxriver76) Https checkbox added
* (foxriver76) Https can be used instead of http
* (foxriver76) Added possibility to authenticate on API
* (foxriver76) de- and encryption added

### 1.7.7 (2018-10-25)
* (foxriver76) Meta information for HmIP-WTH-2 and HMIP-eTRV added (to fix issues with unit and other properties)
* (foxriver76) General role mapping for SET_POINT_TEMPERATURE added

### 1.7.6 (2018-07-29)
* (bluefox) Configuration dialog was corrected

### 1.7.5 (2018-07-20)
* (bluefox) The roles of states were tuned

### 1.7.4 (2018-06-28)
* (BuZZy1337) Added Metas for HM-Sen-MDIR-O-3

### 1.7.3 (2018-06-25)
* (bluefox) E-Paper was corrected

### 1.7.2 (2018-06-11)
* (apollon77) changed reconnection handling

### 1.7.1 (2018-06-11)
* (angelu) changed reconnection handling

### 1.7.0 (2018-06-03)
* (bluefox) Breaking changes: following chars *,;'"`<>\s?" in ADDRESS will be replaces by "_"
* (bluefox) Some roles were changed

### 1.6.2 (2018-04-27)
* (BuZZy1337) Added some missing metas for HM-IP Devices

### 1.6.1 (2018-03-15)
* (bluefox) The binrpc packet 2was updated
* (bluefox) The ping for CUxD was disabled

### 1.6.0 (2018-02-19)
* (Apollon77) Upgrade binrpc library

### 1.5.1 (2018-01-26)
* (bluefox) Ready for Admin3

### 1.5.0 (2017-10-27)
* (bluefox) Add new devices in the meta information
* (bluefox) Force stop of adapter

### 1.4.15 (2017-09-27)
* (bluefox) Added option to not delete the devices

### 1.4.14 (2017-06-19)
* (bluefox) Fix images

### Older entries
[here](doc/OLD_CHANGELOG.md)

## License

The MIT License (MIT)

Copyright (c) 2014-2019 bluefox <dogafox@gmail.com>

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
