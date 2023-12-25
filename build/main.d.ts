import * as utils from '@iobroker/adapter-core';
export declare class HomematicRpc extends utils.Adapter {
    /** On failed rpc call retry in X ms */
    private readonly RETRY_DELAY_MS;
    private readonly metaValues;
    private readonly dpTypes;
    private lastEvent;
    private eventInterval?;
    private connInterval?;
    private daemonURL;
    private daemonProto;
    private homematicPath;
    private readonly COMMON_TYPE_MAPPING;
    private deviceManagement;
    private readonly methods;
    constructor(options?: Partial<utils.AdapterOptions>);
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    private onReady;
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback call this in any case, it is necessary to clean up the adapter correctly
     */
    private onUnload;
    /**
     * Is called if a subscribed state changes
     *
     * @param id the state id
     * @param state the actual state, nullish if deleted
     */
    private onStateChange;
    /**
     * Handle messages send to this instance
     * @param obj the message object
     */
    private onMessage;
    /**
     * Connect to the CCU
     *
     * @param isFirst if it's the initial connection
     */
    private connect;
    /**
     * Send ping to API, if error response, set status disconnected and try reconnect
     */
    private sendPing;
    /**
     * Keeps connection alive by pinging or reconnecting if ping is too old
     */
    private keepAlive;
    /**
     * Sends init to RPC server
     */
    private sendInit;
    /**
     * Inits the RPC server
     */
    private initRpcServer;
    /**
     * Adds the paramset objects of the given paramset to the given channel
     *
     * @param channel - channel object with at least "_id" property
     * @param paramset - paramset object retrived by CCU
     */
    private addParamsetObjects;
    /**
     * This method just performs an async rpc method call
     *
     * @param method the method name
     * @param params the method specific parameters
     */
    private rpcMethodCallAsyncHelper;
    /**
     * Async variant of method call which also performs a retry on first error of "setValue"
     *
     * @param method the method name
     * @param params the method specific parameters
     */
    private rpcMethodCallAsync;
    /**
     * Control the EPAPER display
     *
     * @param id
     * @param data
     */
    private controlEPaper;
    /**
     * Read signal from EPAPER display
     *
     * @param id
     */
    private readSignals;
    /**
     * Read the settings from EPAPER display
     *
     * @param id
     */
    private readSettings;
    /**
     * Get value paramsets and add them
     *
     * @param valueParamsets
     */
    private getValueParamsets;
    /**
     * Add EPAPER to meta objects
     */
    private addEPaperToMeta;
    /**
     * Create the devices delivered in the device array
     *
     * @param deviceArr - array of devices
     */
    private createDevices;
    /**
     * Get all CuxD devices
     */
    private getCuxDevices;
    /**
     * Update the connection indicator and ensure ping interval is running
     */
    private updateConnection;
    /**
     * Derives the common properties of a Paramset SPECIAL attribute
     *
     * @param paramObj Paramset Object with SPECIAL property
     * @param obj ioBroker state object which will be extended
     */
    private addCommonSpecial;
}
