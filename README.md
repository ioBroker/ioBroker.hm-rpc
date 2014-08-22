# ioBroker HomeMatic RPC Adapter

Connects HomeMatic Interface-Processes ("BidCos-Service" or rfd/hs485d on a CCU) to ioBroker

## Install

```node iobroker.js add hm-rpc```

### Configuration

common.host has to be the hostname/ip under which the host that is running the adapter itself is reachable. This address
is used by the CCU to connect to the adapter.

native.ip is the IP of the HomeMatic CCU respectively the Host that is running the BidCos-Service(s)

## Changelog

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

* BIN-RPC Support for CUxD
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

