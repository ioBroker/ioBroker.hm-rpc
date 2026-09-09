![logo](media/homematic.png)

# HomeMatic RPC

## Homematic
> Homematic is eQ-3's smart home system that provides comprehensive control of a wide range of features, from scenarios (from simple to complex) in the home or apartment.

&gt; The devices include products for light, roller shutter and heating control, hazard detectors, safety sensors and weather data measurement products. Radio communication simplifies retrofitting. In new buildings wire bus components can be used. <a href="https://www.eq-3.de/produkte/homematic.html" title="Homepage of the manufacturer eQ3">source</a>

## Administration and control of homematic components with ioBroker
To optimally manage and control homematic components with ioBroker, two adapters are required:

### 1. Homematic ReGaHss
This adapter connects to the homematic logic layer "ReGaHSS" (** Re **sidential** Gateway).
It synchronizes real names, system variables, rooms, trades and programs between Homematic and ioBroker.

### 2. Homematic RPC
The **R** emote **P** rocedur **C** all, RPC for short is a technique for realizing interprocess communication. This adapter provides the connection to the communication modules of a homematic central unit (CCU / CCU2 / CCU3 ...). The modules rfd (radio), HMIP-rfd, hs485d (wired), CuxD (additional software for connecting external components such as EnOcean, FS20, etc.) and Homegear (CCU replacement) are supported.

This diagram illustrates the structure and communication interfaces:

![](media/Homematic_Aufbau.png)

[source](http://www.wikimatic.de/wiki/Datei:Homematic_Aufbau.png)

## Adapter Homematic RPC
This adapter provides the connection to the communication modules of a homematic central unit (CCU / CCU2 / CCU3 ...). An instance of the adapter is responsible for exactly ON modules (rfd, wired, etc.). If several modules are to be supported in parallel, a separate instance must be installed for each module.

The adapter communicates with the corresponding module either via BIN-RPC or XML-RPC. Since an event interface is used, the correct addressing is important. Thus, events are automatically transmitted to the adapter and cyclic polling is not necessary.

In addition, the adapter has the functionality to cyclically monitor the connection to the CCU.

If new devices are taught-in at the CCU, then the adapter must be restarted with the configuration "Initiate devices new (once)". This will transfer the information from the new homematic devices to the adapter.

## Configuration
### Main Settings
### HomeMatic address
IP address of the CCU or host running the Homematic BidCos service.

### HomeMatic Port
The setting of the port depends on the required communication module, is entered automatically when selecting the daemon and should only be changed if the ports deviate from the standard.

By default, the following ports are provided:

| Communication module | Standard port | HTTPS port |
|---------------------|--------------|------------|
| Radios (RFD) | 2001 | 42001 |
| Wired | 2000 | 42000 |
| CUxD | 8701 | \ - |
| Homematic IP | 2010 | 42010 |

### Daemon
CCU / Homematic supports different device types (wired, wireless, HMIP, CUxD). For each type a separate instance must be created.

### Protocol
Two protocols are provided for communication: XML-RPC and BIN-RPC.

* CUxD requires the BIN-RPC protocol; HMIP and RFD the XML-RPC protocol. *

### Synchronize devices again (once)
When the adapter is started for the first time, all devices are read. If changes are later made within the CCU (renaming devices, adding new devices, etc.), activate this selection and restart the adapter with "Save and Close".

### Adapter Address
The pull-down menu selects the IP of the host where the adapter is installed. The selection of "0.0.0.0 Listen to all IPs" and "127.0.0.1" is reserved for special cases.

### Adapter Port
By default, port "0" is set here for the automatic selection of the ioBroker port and should only be changed in exceptional cases.

## Additional settings
### Adapter Callback Address
If ioBroker runs behind a router (for example, in a Docker container), input and output addresses may differ. If the IP of the router is entered here, the problem can be avoided, since then the forwarding to ioBroker is taken over by the router.

### Connection check interval (sec)
At the specified interval, a ping request is sent to the CCU.

### Reconnect interval (sec)
Time after which a new connection attempt is started.

### Do not delete devices
By default, devices are also removed from the object list if they have been learned within the CCU. To keep these devices in the object list, for example because they have only been temporarily removed, this option can be activated.

### Use HTTPS
If this option is activated, a secure connection is established.
Works only with XML-RPC protocol.

### Username and password
When using HTTPS or if the API of the CCU requires authentication, the data must be entered here.

## Instance
![instance](media/10d34a2bc1518fa34233bdb04219e444.png)

Under *Instances* of the ioBroker you will find the installed instance of the adapter. On the left, the traffic light system visualizes whether the adapter is activated and connected to the CCU.

If you place the mouse pointer on a symbol, you will get detailed information.

## Objects of the adapter
In the Objects area, all values and information transmitted by the CCU to the adapter are displayed in a tree structure.

The objects and values displayed depend on the devices (function and channels) and the structure within the CCU.

The control panel is marked with the ID BidCoS-RF (which includes all virtual keys), devices are created under their serial number and groups are labeled with INT000000 *x*

### Channel 0 (all devices)
This channel is created for each device and contains function data, following a brief overview:

| *Data point* | *Meaning* |
|--------------------------------|--------------------------------------------------------|
| AES_Key | Encrypted activation active / inactive |
| Config (Pending / Pending Alarm) | Pending configuration |
| Dutycycle / Dutycycle Alarm | Airtime Homematic Devices |
| RSSI (Device / Peer) | Radio strength (device \ <-> Central) |
| Low Bat / Low Bat Alarm | low battery charge |
| Sticky unreach / unreach alarm | System message communication error (fault occurred) |
| Unreach / unreach alarm | System message communication error (current state) |

### Channels 1-6
Here, measured values, control and status data are listed; depending on the function of the device different data are displayed. Here is a short excerpt:

| *Function* | *Channel* | *Possible values* |
|-------------------------|---------|-----------------------------------------------------------|
| Sensors | 1 | Temperature, humidity, level, opening condition, etc. |
| Heating thermostats | 4 | Operating modes, setpoint / actual temperature, valve position, etc. |
| Actuators | 1 | Level (roller shutter, dimmer), running direction (roller blind), etc. |
| Devices with measuring function | 3 | Status |
| | 6 | Consumption meter, voltage, power, etc. |

## FAQ

## What is Sentry.io and what is reported to the servers of that company?
Sentry.io is a service for developers to get an overview about errors from their applications. Exactly this is implemented in this adapter.

When the adapter crashes or another Code error happens, this error message that also appears in the ioBroker log is submitted to Sentry. 
When you have allowed ioBroker GmbH to collect diagnostic data, then also your installation ID (this is just a unique ID **without** any additional infos about you, email, name or such) is included. This allows Sentry to group errors and show how many unique users are affected by such an error. All of these helps me to provide error-free adapters that basically never crash.

## Custom commands
It is possible to send custom commands, e.g., to read and control the master area of a device which allows the user 
to configure heating week programs and more.

This is done by sending a message to the adapter, which contains the method as first parameter, followed by an object which 
has to contain the `ID` of the target device as well as optional the `paramType`, which specifies e.g. the MASTER area.
Additional parameters have to be sent in the `params` object.

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

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### 4.0.0 (2026-08-15)
* (bluefox) Device icons are now delivered as theme-adaptive SVGs and stay visible on the dark admin theme
* (krobipd) Generated the device icon set and the device type map from the OCCU device database
* (krobipd) The device icon is re-applied on start to devices that were created before their type had an icon
* (bluefox) Removed support of Node.js 20

### 3.0.2 (2026-05-07)
* (bluefox) Updated packages
* (bluefox) Migrated to TypeScript 6
* (bluefox) Corrected device manager

### 3.0.1 (2025-10-22)
* (bluefox) Renamed role of `STICKY_UNREACH` to `indicator.unreach.sticky` for the better typing detection

### 3.0.0 (2025-10-21)
* (bluefox) Updated packages and used `@iobroker/eslint-config`
* (bluefox) Renamed some roles for the better typing detection
* (bluefox) Removed support of Node.js 18

### 2.0.2 (2024-08-26)
* (bluefox) Updated packages

### Older entries
[here](OLD_CHANGELOG.md)

[Older changelogs can be found there](CHANGELOG_OLD.md)

## License

The MIT License (MIT)

Copyright (c) 2014-2026 bluefox <dogafox@gmail.com>

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
