import { Channel } from "./Channel.js";
import { Task } from "./Task.js";

/**
 * ParallelChannel class (queue)
 * @augments Channel
 */
export class ParallelChannel extends Channel {
    private _parallelism: number;
    private _runningTasks: Task[];
    canRunAcrossTaskTypes: boolean;

    constructor(name: string) {
        super(name);
        this._parallelism = 2;
        this._runningTasks = [];
        this.canRunAcrossTaskTypes = false;
    }

    /**
     * Whether the queue is empty or not
     * @type {Boolean}
     * @readonly
     */
    get isEmpty() {
        return super.isEmpty && this._runningTasks.length <= 0;
    }

    /**
     * The amount of allowed parallel executed tasks
     * @type {Number}
     * @readonly
     */
    get parallelism() {
        return this._parallelism;
    }

    /**
     * Get the currently running tasks
     * @type {Array<Task>}
     * @readonly
     */
    get runningTasks() {
        return this._runningTasks;
    }

    set parallelism(count: number) {
        // NaN or a string would stop the channel for good (Math.max(NaN, 1) is NaN)
        if (typeof count !== "number" || !Number.isFinite(count) || count < 1) {
            throw new Error(`Invalid parallelism: expected a number of at least 1, got ${count}`);
        }
        this._parallelism = Math.floor(count);
    }

    /**
     * Start processing the queue. When it is already running, a task added
     * since then starts at once if a slot is free, instead of waiting for a
     * running task to end.
     * @returns {Boolean} Returns true if started, false if already started
     */
    start(): boolean {
        if (this.isRunning) {
            setTimeout(() => this._runNextItem(), 0);
            return false;
        }
        return super.start();
    }

    _runNextItem() {
        const stopChannel = () => {
            this.isRunning = false;
            this.emit("stopped");
        };
        if (this.runningTasks.length === 0 && this.tasks.length === 0) {
            stopChannel();
            return;
        }
        let itemsToRun = this.parallelism - this.runningTasks.length;
        if (itemsToRun <= 0) {
            return;
        }
        while (itemsToRun > 0) {
            // First check to see if any other tasks are running, and whether or not
            // we're allowed to run tasks of different priorities at the same time
            if (
                !this.canRunAcrossTaskTypes &&
                this.runningTasks.length > 0 &&
                this.tasks.length > 0
            ) {
                const runningType = this.runningTasks[0].type;
                const nextType = this.tasks[0].type;
                if (runningType !== nextType) {
                    // Next item is not of the same type, so we'll skip this round
                    return;
                }
            }
            itemsToRun -= 1;
            const item = this.retrieveNextItem();
            if (!item) {
                // No item, skip
                return;
            }
            this.runningTasks.push(item);
            item.execute(this.tasksThrow).then(() => {
                this.runningTasks.splice(this.runningTasks.indexOf(item), 1);
                this._recordError(item);
                this._runNextItem();
            });
        }
    }
}
