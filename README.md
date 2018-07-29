![Logo](admin/homematic.png)
# ioBroker HomeMatic RPC Adapter
==================

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
- 2001 for wireless devices,
- 2000 for wired devices,
- 8701 for CUxD daemon,
- 2010 for Homematic IP devices

### Daemon
CCU/Homematic can support different types of devices (wired, wireless, hmip, CUxD) and for every type you should create the instance of adapter separately.

### Protocol
There are two protocols for communication XML-RPC and BIN-RPC. BIN-RPC is faster, but it can be, that the end device do not support it or supports it incorrect. In this case switch the protocol to XML.

*Notice:* CUxD can only communicate with BIN-RPC and HMPI only via XML-rpc protocol.

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

## Changelog
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

Copyright (c) 2014-2018 bluefox <dogafox@gmail.com>

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
