import sleep from "sleep-promise";
import { Layerr } from "layerr";
import {
    Channel,
    ChannelQueue,
    ErrorCode,
    ParallelChannel,
    TaskPriority
} from "../../dist/index.js";

async function captureError(callback) {
    try {
        await callback();
    } catch (err) {
        return err;
    }
    return null;
}

describe("Review fixes", function () {
    describe("guards: what the apps depend on", function () {
        it("runs tasks by priority, then in the order they were added", async function () {
            const channel = new Channel("order");
            channel.autostart = false;
            const ran = [];
            const add = (name, type) => channel.enqueue(() => ran.push(name), type);
            add("n1");
            add("t1", TaskPriority.Tail);
            add("h1", TaskPriority.High);
            add("n2");
            add("t2", TaskPriority.Tail);
            add("h2", TaskPriority.High);
            add("n3", TaskPriority.Normal);
            channel.start();
            await channel.waitForEmpty();
            expect(ran).to.deep.equal(["h1", "h2", "n1", "n2", "n3", "t1", "t2"]);
        });

        it("gives repeat calls with the same stack the pending task's promise", async function () {
            const channel = new Channel("stack");
            channel.autostart = false;
            let calls = 0;
            const p1 = channel.enqueue(() => ++calls, undefined, "s");
            const p2 = channel.enqueue(() => ++calls, undefined, "s");
            expect(p1).to.equal(p2);
            channel.start();
            expect(await p1).to.equal(1);
            expect(calls).to.equal(1);
        });
    });

    describe("B-561: the time limit's timer is cleared when the task fails", function () {
        it("leaves no timer behind after a rejection", async function () {
            const clock = sinon.useFakeTimers();
            try {
                const channel = new Channel("timer");
                const pending = channel.enqueue(
                    () => Promise.reject(new Error("fail")),
                    TaskPriority.Normal,
                    undefined,
                    60000
                );
                pending.catch(() => {});
                await clock.tickAsync(10);
                expect(await captureError(() => pending)).to.be.an("error");
                expect(clock.countTimers()).to.equal(0);
            } finally {
                clock.restore();
            }
        });
    });

    describe("B-586: ParallelChannel", function () {
        it("starts a task added later in a free slot at once", async function () {
            const channel = new ParallelChannel("late");
            channel.parallelism = 2;
            const started = {};
            const t0 = Date.now();
            const a = channel.enqueue(async () => {
                started.a = Date.now() - t0;
                await sleep(400);
            });
            await sleep(50);
            const b = channel.enqueue(async () => {
                started.b = Date.now() - t0;
            });
            await Promise.all([a, b]);
            expect(started.b).to.be.below(300);
        });

        it("honours tasksThrow = false and reports the failure to waitForEmpty", async function () {
            const channel = new ParallelChannel("throw");
            channel.tasksThrow = false;
            const result = await captureError(() =>
                channel.enqueue(() => Promise.reject(new Error("boom")))
            );
            expect(result).to.equal(null);
            const error = await captureError(() =>
                channel.waitForEmpty({ throwForFailures: true })
            );
            expect(error).to.be.an("error");
        });

        it("refuses a parallelism that is not a number of at least 1", function () {
            const channel = new ParallelChannel("bad");
            expect(() => (channel.parallelism = NaN)).to.throw(/parallelism/i);
            expect(() => (channel.parallelism = "3")).to.throw(/parallelism/i);
            expect(channel.parallelism).to.equal(2);
        });

        it("refuses the same values in createParallelChannel and creates no channel", function () {
            const queue = new ChannelQueue();
            expect(() => queue.createParallelChannel("zero", 0)).to.throw(/parallelism/i);
            expect(queue.channelExists("zero")).to.equal(false);
            expect(queue.createParallelChannel("default").parallelism).to.equal(2);
            expect(queue.createParallelChannel("five", 5).parallelism).to.equal(5);
        });
    });

    describe("B-587: clear() and waitForEmpty", function () {
        it("rejects the cleared tasks' promises with TaskCleared", async function () {
            const channel = new Channel("clear");
            channel.autostart = false;
            const pending = channel.enqueue(() => 1);
            channel.clear();
            const error = await Promise.race([
                captureError(() => pending),
                sleep(200).then(() => "still pending")
            ]);
            expect(error).to.be.an("error");
            expect(Layerr.info(error).code).to.equal(ErrorCode.TaskCleared);
        });

        it("rejects only the cleared priority", async function () {
            const channel = new Channel("clear-type");
            channel.autostart = false;
            const tail = channel.enqueue(() => "tail", TaskPriority.Tail);
            const normal = channel.enqueue(() => "normal");
            channel.clear(TaskPriority.Tail);
            channel.start();
            expect(await normal).to.equal("normal");
            expect(Layerr.info(await captureError(() => tail)).code).to.equal(
                ErrorCode.TaskCleared
            );
        });

        it("reports a failure once, not on every later wait", async function () {
            const channel = new Channel("errors");
            channel.tasksThrow = false;
            await channel.enqueue(() => Promise.reject(new Error("old")));
            expect(
                await captureError(() => channel.waitForEmpty({ throwForFailures: true }))
            ).to.be.an("error");
            await channel.enqueue(() => "fine");
            expect(
                await captureError(() => channel.waitForEmpty({ throwForFailures: true }))
            ).to.equal(null);
        });

        it("keeps a bounded number of unreported failures", async function () {
            const channel = new Channel("many");
            channel.tasksThrow = false;
            await Promise.all(
                Array.from({ length: 300 }, () =>
                    channel.enqueue(() => Promise.reject(new Error("x")))
                )
            );
            expect(channel._taskErrors.length).to.be.at.most(100);
            expect(
                await captureError(() => channel.waitForEmpty({ throwForFailures: true }))
            ).to.be.an("error");
        });
    });

    describe("B-590: robustness", function () {
        it("queues 20000 tasks without re-sorting the whole queue each time", function () {
            // The time limit below decides, not mocha's: the old code took over 2 s
            this.timeout(20000);
            const channel = new Channel("many-tasks");
            channel.autostart = false;
            const started = Date.now();
            for (let i = 0; i < 20000; i += 1) {
                channel
                    .enqueue(() => {}, i % 3 === 0 ? TaskPriority.High : TaskPriority.Normal)
                    .catch(() => {});
            }
            const took = Date.now() - started;
            expect(channel.tasks).to.have.lengthOf(20000);
            expect(took, `${took} ms`).to.be.below(1000);
        });

        it("keeps the order a full sort after each push gave", function () {
            const channel = new Channel("insert");
            channel.autostart = false;
            const types = [TaskPriority.High, TaskPriority.Normal, TaskPriority.Tail];
            const pushed = [];
            const until = Date.now() + 30;
            let i = 0;
            // Spans several milliseconds, so tasks differ in priority and in created time
            while (Date.now() < until || i < 3000) {
                const before = new Set(channel.tasks);
                channel.enqueue(() => {}, types[(i * 7919) % 3]).catch(() => {});
                pushed.push(channel.tasks.find(task => !before.has(task)));
                i += 1;
            }
            const reference = new Channel("reference");
            reference._tasks = pushed.slice();
            reference.sort();
            expect(new Set(pushed.map(task => task.created)).size).to.be.above(1);
            expect(channel.tasks).to.have.lengthOf(pushed.length);
            const mismatch = channel.tasks.findIndex((task, n) => task !== reference.tasks[n]);
            expect(mismatch).to.equal(-1);
        });

        it("accepts any channel name, including hasOwnProperty and __proto__", function () {
            const queue = new ChannelQueue();
            expect(queue.channel("hasOwnProperty")).to.be.an.instanceOf(Channel);
            expect(queue.channel("other")).to.be.an.instanceOf(Channel);
            const proto = queue.channel("__proto__");
            expect(proto).to.be.an.instanceOf(Channel);
            expect(queue.channelExists("__proto__")).to.equal(true);
            expect(queue.channel("__proto__")).to.equal(proto);
            expect(queue.channelExists("toString")).to.equal(false);
        });
    });
});
