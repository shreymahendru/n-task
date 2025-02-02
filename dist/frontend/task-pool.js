"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskPool = void 0;
const tslib_1 = require("tslib");
const n_defensive_1 = require("@nivinjoseph/n-defensive");
const n_util_1 = require("@nivinjoseph/n-util");
const n_exception_1 = require("@nivinjoseph/n-exception");
class TaskPool {
    constructor(taskWorker, count = 1) {
        this._taskWorkers = new Array();
        this._taskQueue = new Array();
        this._isInitialized = false;
        this._disposePromise = null;
        (0, n_defensive_1.given)(taskWorker, "taskWorker").ensureHasValue().ensureIsFunction();
        this._taskWorkerClass = taskWorker;
        (0, n_defensive_1.given)(count, "count").ensureHasValue().ensureIsNumber().ensure(t => t > 0);
        this._count = count;
    }
    get _isDisposed() { return this._disposePromise != null; }
    initializeWorkers(initializerMethod, ...initializerParams) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(initializerMethod, "initializerMethod").ensureIsString();
            (0, n_defensive_1.given)(initializerParams, "initializerParams").ensureIsArray();
            (0, n_defensive_1.given)(this, "this").ensure(t => !t._isInitialized, "already initialized");
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            this._createWorkers();
            if (initializerMethod != null)
                yield Promise.all(this._taskWorkers.map(t => t.execute(n_util_1.Uuid.create(), initializerMethod, ...initializerParams)));
            this._isInitialized = true;
        });
    }
    invoke(method, ...params) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(method, "method").ensureHasValue().ensureIsString();
            (0, n_defensive_1.given)(params, "params").ensureHasValue().ensureIsArray();
            (0, n_defensive_1.given)(this, "this").ensure(t => t._isInitialized, "not initialized");
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            return this._enqueue(method, params);
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._taskQueue.forEach(t => t.deferred.reject("disposed"));
                this._taskQueue.clear();
                this._disposePromise = Promise.all(this._taskWorkers.map(t => t.dispose()));
            }
            return this._disposePromise;
        });
    }
    _createWorkers() {
        n_util_1.Make.loop(() => {
            const taskWorker = new TaskWorkerInstance(this._taskWorkerClass);
            taskWorker.initialize(this._onAvailable.bind(this));
            this._taskWorkers.push(taskWorker);
        }, this._count);
    }
    _onAvailable(twi) {
        (0, n_defensive_1.given)(twi, "twi").ensureHasValue().ensureIsObject().ensureIsType(TaskWorkerInstance);
        this._executeAvailableWork(twi);
    }
    _enqueue(method, params) {
        const taskItem = {
            id: n_util_1.Uuid.create(),
            deferred: new n_util_1.Deferred(),
            method,
            params
        };
        this._taskQueue.unshift(taskItem);
        this._executeAvailableWork();
        return taskItem.deferred.promise;
    }
    _executeAvailableWork(twi) {
        if (this._taskQueue.isEmpty)
            return;
        const availableWorker = twi !== null && twi !== void 0 ? twi : this._taskWorkers.find(t => !t.isBusy);
        if (availableWorker == null)
            return;
        const work = this._taskQueue.pop();
        availableWorker
            .execute(work.id, work.method, ...work.params)
            .then(t => work.deferred.resolve(t))
            .catch(e => work.deferred.reject(e));
    }
}
exports.TaskPool = TaskPool;
class TaskWorkerInstance {
    constructor(taskWorkerClass) {
        this._availabilityObserver = new n_util_1.Observer("available");
        this._disposePromise = null;
        this._currentTask = null;
        (0, n_defensive_1.given)(taskWorkerClass, "taskWorkerClass").ensureHasValue().ensureIsFunction();
        this._id = n_util_1.Uuid.create();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        this._worker = new taskWorkerClass();
    }
    get _isInitialized() { return this._availabilityObserver.hasSubscriptions; }
    get _isDisposed() { return this._disposePromise != null; }
    get id() { return this._id; }
    get isBusy() { return this._currentTask != null; }
    initialize(availabilityCallback) {
        (0, n_defensive_1.given)(availabilityCallback, "availabilityCallback").ensureHasValue().ensureIsFunction();
        (0, n_defensive_1.given)(this, "this").ensure(t => !t._isInitialized, "already initialized");
        if (this._isDisposed)
            throw new n_exception_1.ObjectDisposedException(this);
        this._availabilityObserver.subscribe(availabilityCallback);
        this._worker.onmessage = (e) => {
            const id = e.data.id;
            const error = e.data.error;
            const result = e.data.result;
            if (this._currentTask.id !== id) {
                this._currentTask.deferred
                    .reject(new n_exception_1.ApplicationException("Current task id does not match id of task result."));
            }
            else {
                if (error != null)
                    this._currentTask.deferred.reject(error);
                else
                    this._currentTask.deferred.resolve(result);
            }
            this._currentTask = null;
            this._availabilityObserver.notify(this);
        };
    }
    execute(id, method, ...params) {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            (0, n_defensive_1.given)(id, "id").ensureHasValue().ensureIsString();
            (0, n_defensive_1.given)(method, "method").ensureHasValue().ensureIsString();
            (0, n_defensive_1.given)(params, "params").ensureHasValue().ensureIsArray();
            (0, n_defensive_1.given)(this, "this")
                .ensure(t => t._isInitialized, "worker instance not initialized")
                .ensure(t => !t.isBusy, "worker instance is busy");
            if (this._isDisposed)
                throw new n_exception_1.ObjectDisposedException(this);
            this._currentTask = {
                id,
                deferred: new n_util_1.Deferred()
            };
            this._worker.postMessage({
                id: this._currentTask.id,
                type: method.trim(),
                params
            });
            return this._currentTask.deferred.promise;
        });
    }
    dispose() {
        return tslib_1.__awaiter(this, void 0, void 0, function* () {
            if (!this._isDisposed) {
                this._availabilityObserver.cancel();
                this._worker.terminate();
                this._disposePromise = Promise.resolve();
            }
            return this._disposePromise;
        });
    }
}
//# sourceMappingURL=task-pool.js.map