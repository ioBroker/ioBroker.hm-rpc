![Logo](admin/homematic.png)
# ioBroker HomeMatic RPC Adapter

Connects HomeMatic Interface-Processes (BidCos-Services, Homegear and CUxD) via XML-RPC or BIN-RPC to ioBroker

## Install

```node iobroker.js add hm-rpc```

### Configuration

native.adapterAddress has to be the ip under which the host that is running the adapter itself is reachable.
This address is used by the CCU to connect to the adapter.

native.homematicAddress is the IP of the HomeMatic CCU respectively the Host that is running the BidCos-Service(s)

## Changelog
### 0.2.3 (2014-10-20)
* (bluefox) fix error in the event output

### 0.2.2 (2014-10-19)
* (bluefox) translate config

### 0.2.1
* (hobbyquaker) changed XML-RPC module source

### 0.2.0
* (hobbyquaker) added BIN-RPC support
* (hobbyquaker) added CUxD support
* (hobbyquaker) bugfixes

### 0.1.12
* (hobbyquaker) fixed error in package.json

### 0.1.11
* (hobbyquaker) fixed rpc event unit 100%

### 0.1.10
* (hobbyquaker) fixed rpc setValue type
* (hobbyquaker) fixed rpc setValue unit 100%

### 0.1.9
* (hobbyquaker) queue device/channel/datapoint creation - fixes missing children
* (hobbyquaker) added more role attributes (still many missing)

### 0.1.8
* (hobbyquaker) added more role attributes (still many missing)
* (hobbyquaker) fixes

### 0.1.7
* (hobbyquaker) renamed "ip" to "homematicAddress" and "port" to "homematicPort"
* (hobbyquaker) new config attribute "adapterAddress"
* (hobbyquaker) fixes
* (hobbyquaker) added more role attributes (still many missing)

### 0.1.6
* (hobbyquaker) config UI

### 0.1.5
* (hobbyquaker) added common.children

### 0.1.4
* (hobbyquaker) set connected state, prepared connection check

### 0.1.3
* (hobbyquaker) ship known meta.paramsetDescription
* (hobbyquaker) add meta.roles - table for channel/state common.role assignment

### 0.1.2

* (hobbyquaker) fix getValueParamset

### 0.1.1

* (hobbyquaker) prepare channel common.role

### 0.1.0

* (hobbyquaker) First Release

## Roadmap

* PING/PONG implementation when possible (CCU Firmware >= 2.9) - check via system.listMethods

## License

The MIT License (MIT)

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

