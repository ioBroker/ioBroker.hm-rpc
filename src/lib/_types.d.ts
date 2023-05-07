export interface DatapointTypeObject {
    UNIT?: string;
    TYPE: string;
    MIN?: ParamsetMinMax;
    MAX?: ParamsetMinMax;
}

export interface ParamsetObjectWithSpecial extends ParamsetObject {
    SPECIAL: ParamsetObjectSpecialEntry[];
}

export interface MulticallEvent {
    methodName: string;
    params: any;
}

export interface ParamsetObjectSpecialEntry {
    ID: string;
    VALUE: number;
}

export interface EPaperSignalObject {
    TYPE: string;
    ID: string;
    STATES: Record<string, string>;
    OPERATIONS: number;
}

export interface EPaperToneObject {
    TYPE: string;
    ID: string;
    STATES: Record<string, string>;
    OPERATIONS: number;
}

export interface EPaperToneIntervalObject {
    TYPE: string;
    ID: string;
    MIN: number;
    MAX: number;
    OPERATIONS: number;
    DEFAULT: number;
}

export interface EPaperToneRepetitionsObject {
    TYPE: string;
    ID: string;
    MIN: number;
    MAX: number;
    OPERATIONS: number;
    DEFAULT: number;
}

export interface EPaperLineObject {
    TYPE: string;
    ID: string;
    OPERATIONS: number;
}

export interface EPaperIconObject {
    TYPE: string;
    ID: string;
    STATES: Record<string, string>;
    OPERATIONS: number;
}

export type ParamsetMinMax = boolean | number | string;

export interface ParamsetObject {
    DEFAULT?: string | boolean | number;
    FLAGS: number;
    ID: string;
    MAX: ParamsetMinMax;
    MIN: ParamsetMinMax;
    OPERATIONS: number;
    TAB_ORDER: number;
    TYPE:
        | 'ACTION'
        | 'BOOL'
        | 'FLOAT'
        | 'ENUM'
        | 'INTEGER'
        | 'EPAPER_LINE'
        | 'EPAPER_ICON'
        | 'EPAPER_TONE'
        | 'EPAPER_SIGNAL'
        | 'EPAPER_TONE_INTERVAL'
        | 'EPAPER_TONE_REPETITIONS';
    UNIT?: string;
    VALUE_LIST?: string[];
    SPECIAL?: ParamsetObjectSpecialEntry[];
    STATES?: any;
    CONTROL?: string;
    EPAPER_LINE?: EPaperLineObject;
    EPAPER_ICON?: EPaperIconObject;
    EPAPER_LINE2?: EPaperLineObject;
    EPAPER_ICON2?: EPaperIconObject;
    EPAPER_LINE3?: EPaperLineObject;
    EPAPER_ICON3?: EPaperIconObject;
    EPAPER_LINE4?: EPaperLineObject;
    EPAPER_ICON4?: EPaperIconObject;
    EPAPER_SIGNAL: EPaperSignalObject;
    EPAPER_TONE: EPaperToneObject;
    EPAPER_TONE_INTERVAL: EPaperToneIntervalObject;
    EPAPER_TONE_REPETITIONS: EPaperToneRepetitionsObject;
    WORKING?: boolean;
}

export interface ListDevicesEntry {
    ADDRESS?: string;
    VERSION?: string;
}

export type Daemon = 'CUxD' | 'virtual-devices' | 'rfd' | 'hs485d' | 'HMIP';

export interface FixParamsetParams {
    /** the paramset, which will be fixed */
    paramObj: ParamsetObjectWithSpecial | ParamsetObject;
    /** selected daemon type */
    daemon: Daemon;
}

export interface FixEventParams {
    /** the current datapoint value */
    val: any;
    /** the corresponding datapoint type */
    dpType: DatapointTypeObject;
}
