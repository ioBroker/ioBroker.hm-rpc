# Older changes
## 1.15.19 (2023-08-08)
* (bluefox) Updated packages

## 1.15.18 (2023-05-08)
* (foxriver76) no longer support EOL versions, please upgrade to node 16

## 1.15.18 (2023-05-08)
* (foxriver76) no longer support EOL versions, please upgrade to node 16

## 1.15.17 (2023-05-07)
* (foxriver76) added new images (closes #778, closes #873, closes #882)
* (foxriver76) fix wrong paramsets (closes #617, closes #584, closes #539, closes #764, closes #460, closes #748, closes #756)
* (foxriver76) fix wrong events (closes #872)

## 1.15.16 (2022-12-08)
* (foxriver76) we have linked images of new devices
* (foxriver76) we ensure, that the `LEVEL` datapoint of blinds is of role `level.blind` (closes #681)

## 1.15.15 (2022-08-25)
* (foxriver76) Retry once on `(UNREACH)` and `Failure` errors to avoid temporary communication issues (closes #467)
* (foxriver76) we have updated some device icons

## 1.15.12 (2022-03-19)
* (foxriver76) we now adjust min/max correct if a `SPECIAL` value falls out of range (closes #459)

## 1.15.11 (2022-03-18)
* (foxriver76) fallback to old adapter port determination logic (closes #509)

## 1.15.10 (2022-03-17)
* (foxriver76) we use our own set of forbidden chars again

## 1.15.9 (2022-03-15)
* (foxriver76) fixed handling of `replaceDevice` event
* (foxriver76) we have fixed some log messages
* (foxriver76) added image of HmIP-SMI55-2

## 1.15.8 (2022-02-23)
* (foxriver76) we now ensure, that the `uuid` used for connection is really unique

## 1.15.7 (2022-02-20)
* (foxriver76) fixed new devices being created as `undefined`

## 1.15.6 (2022-02-16)
* (foxriver76) implemented workaround for the RSSI_DEVICE 128 bug if devices connect to HMIP-HAP (fixes #346, #469, #402)

## 1.15.5 (2022-02-12)
* (foxriver76) added handler for `readdedDevice` event (closes #356)
* (foxriver76) added error handling on rpc server (fixes #457)
* (foxriver76) added icon of HmIP-eTRV-E-S (closes #456)

## 1.15.2 (2022-02-02)
* (foxriver76) we also fixed type of default value if boolean on heating groups

## 1.15.1 (2022-02-02)
* (foxriver76) we fixxed type of default value and min/max of heating groups (closes #443)

## 1.15.0 (2021-12-26)
* (foxriver76) added image for `HmIP-STE2-PCB`
* (foxriver76) we now handle `replaceDevice` requests by deleting old device and creating new one (closes #420)

## 1.14.50 (2021-11-18)
* (foxriver76) `meta.roles` is no longer an object, because it is kept in RAM anyway (closes #407)

## 1.14.49 (2021-11-18)
* (foxriver76) handle cases where we cannot retrive `meta.roles` (addresses #407)

## 1.14.46 (2021-11-14)
* (foxriver76) added logging for "no dpType" scenarios
* (foxriver76) added image of HmIP-eTRV-E
* (foxriver76) added image of HmIPW-WRC6

## 1.14.45 (2021-08-12)
* (foxriver76) we fixed several sentry issues (closes #368, closes #370)

## 1.14.43 (2021-07-05)
* (foxriver76) we now correctly map the role of smoke detectors (closes #354)

## 1.14.42 (2021-06-27)
* (bluefox) Added the roles to thermostat states
* (bluefox) Added the roles for switch
* (bluefox) Apply new roles to existing states

## 1.14.41 (2021-06-05)
* (foxriver76) we made sure, that controller does not send stopInstance message anymore

## 1.14.39 (2021-06-04)
* (foxriver76) remove the stopInstance message handling and put everything in unload
* (bluefox) removed the white background by some icons

## 1.14.38 (2021-05-11)
* (Jens Maus) fixed the VirtualDevices min/max/default assignment (fixes #332)
* (foxriver76) do not scale on normal '%' UNIT because its inconsistent (fixes #326)

## 1.14.37 (2021-04-23)
* (foxriver76) added tier, is now 2
* (foxriver76) added missing images (closes #319)

## 1.14.36 (2021-04-14)
* (foxriver76) error handling improved when deleting obsolete devices/channels
* (foxriver76) if no message id provided on `sendTo`, we do not send `undefined` params anymore (fixes #318)

## 1.14.35 (2021-02-13)
* (foxriver76) virtual devices now support ping, so use it, else it can be that instance won't register at CCU again (fixes #308)

## 1.14.34 (2021-02-11)
* (foxriver76) use async rpc calls for better error handling
* (foxriver76) now log error events received by XML-RPC
* (foxriver76) detect invalid params and log instead of crash

## 1.14.33 (2021-01-30)
* (foxriver76) fix problems with CuxD and HM-IP (fixes #307)
* (foxriver76) more places where we now log message on real errors instead of error object

## 1.14.32 (2021-01-29)
* (foxriver76) revert received messages with invalid command
* (foxriver76) log message on real errors instead of error object
* (foxriver76) fix for crashes on decrypt

## 1.14.31 (2021-01-15)
* (foxriver76) fixed default values of HM-IP value list states

## 1.14.30 (2021-01-10)
* (foriver76) in general reject events of unregistered devices, see #298

## 1.14.29 (2021-01-09)
* (foxriver76) do not set PONG state anymore

## 1.14.26 (2021-01-05)
* (foxriver76) match clientId with namespace to find correct units

## 1.14.25 (2021-01-04)
* (foxriver76) we now use a unique id to connect for each client taking the hostname into account

## 1.14.24 (2020-10-15)
* (foxriver76) fixed error with some blinds if no adapter restart has been performed

## 1.14.23 (2020-09-03)
* (foxriver76) `value.temperature` will have unit °C no matter of delivered unit by CCU

## 1.14.21 (2020-08-18)
* (foxriver76) fixed virtual-devices objects being recreated on the instance start (#271)

## 1.14.20 (2020-08-17)
* (foxriver76) fix for % scaling of float numbers

## 1.14.19 (2020-08-16)
* (foxriver76) now logging exact command on error

## 1.14.18 (2020-08-08)
* (foxriver76) fix issue when CuxD listDevices does not deliver a valid array
* (foxriver76) fix error with % scaling in some edge cases

## 1.14.15 (2020-07-21)
* (foxriver76) fix bug on forced reinitialization run

## 1.14.14 (2020-07-10)
* (bluefox) Added roles for presence sensor

## 1.14.13 (2020-07-07)
* (foxriver76) fixed the edge case on E-PAPER command (IOBROKER-HM-RPC-5Z)
* (foxriver76) Catch error on `createDevices` if CCU does not deliver valid ADDRESS (IOBROKER-HM-RPC-5X)

## 1.14.12 (2020-07-03)
* (foxriver76) Continue execution if error on retrieving a paramset from CCU

## 1.14.11 (2020-06-21)
* (bluefox) Change name of Instance, according to the role (RF, Wired, HM-IP)

## 1.14.10 (2020-06-14)
* (foxriver76) removed metadata caching completely because metadata can be dynamic due to FW update or CuxD

## 1.14.6 (2020-06-05)
* (foxriver76) added some HM-IP roles for channel 0

## 1.14.5 (2020-05-29)
* (foxriver76) fixed the edge case problem IOBROKER-HM-RPC-5E

## 1.14.4 (2020-05-28)
* (jens-maus) updated all device images to latest ones include HM-IP-wired ones

## 1.14.3 (2020-05-18)
* (foxriver76) catch edge case error if `row.value` has no native

## 1.14.2 (2020-04-24)
* (foxriver76) catch errors on rpc client creation

## 1.14.1 (2020-04-23)
* (foxriver76) catch potential errors on createServer
* (foxriver76) new metadata approach: we only store metadata gathered by the user,
otherwise cached metadata can be very old and outdated, we have to monitor the performance 
of this approach (more requests to CCU on first setup)
* (foxriver76) add name and icon to meta folder
* (foxriver76) minor code improvements

## 1.13.0 (2020-04-02)
* (foxriver76) sentry plugin support

## 1.12.10 (2020-03-05)
* (foxriver76) fixed no 'dpType for ..' error in all cases

## 1.12.9 (2020-02-29)
* (foxriver76) replace DISPLAY_DATA_STRING by DIN_66003 encodings

## 1.12.8 (2020-02-26)
* (foxriver76) improved error handling on undefined methods

## 1.12.7 (2020-02-16)
* (foxriver76) if role "value.window" is a boolean it is now correctly a "sensor.window"

## 1.12.6 (2020-01-08)
* (foxriver76) make all LEVEL dps of unit % if they are w.o. unit and have min/max

## 1.12.5 (2020-01-06)
* (foxriver76) handle some metadata more abstract
* (foxriver76) make DIMMER_REAL.LEVEL of unit '%' even it is not by definition

## 1.12.2 (2019-12-19)
* (foxriver76) fix issue on https with less robust ccu emulations

## 1.12.1 (2019-12-06)
* (foxriver76) fixed problem with max values of value lists

## 1.12.0 (2019-12-05)
* (foxriver76) no longer use `adapter.objects`
* (foxriver76) js-controller v > 2 required

## 1.11.1 (2019-11-20)
* (foxriver76) LOCK.OPEN is now of type button to prevent misunderstandings

## 1.11.0 (2019-11-10)
* (foxriver76) make OFFSET and REPEATS of e-paper configurable
* (foxriver76) EPAPER_SIGNAL is now type string

## 1.10.3 (2019-10-27)
* (foxriver76) fixed info channel

## 1.10.2 (2019-10-24)
* (foxriver76) replace min max values of HM-IP with correct numbers

## 1.10.0 (2019-08-12)
* (foxriver76) new metadata handling procedure
* __js-controller >= 1.4.2 required__
