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
});
