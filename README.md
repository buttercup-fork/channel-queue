# channel-queue
A queue management library with channels.

![Tests status](https://github.com/buttercup-fork/channel-queue/actions/workflows/test.yml/badge.svg)

## About

This library provides a queue system, organised by channels (or "topics"), that allows for finer-grain control over asynchronous method execution. It allows for queuing tasks by channels (string-based names) - tasks executing sequentially when the previous task is done. It also allows for 3 priority levels : **normal**, **high** and **tail**.

Check out the [API documentation](API.md).

## Installation

Simply run:

```shell
npm install @buttercup-fork/channel-queue --save
```

The fork is published on npm as `@buttercup-fork/channel-queue` (`@buttercup/channel-queue` on npm is upstream's 1.5.0). It is an ES module and needs NodeJS 22 or newer (or a browser or React Native).

## Usage
The simplest usage is to just queue some tasks:

```typescript
import { ChannelQueue } from "@buttercup-fork/channel-queue";

const queue = new ChannelQueue();
const work = queue.channel("myChannel").enqueue(() => 123);
// 'work' will resolve with 123

const someChannel = queue.channel("someChannel");
someChannel.enqueue(job1);
someChannel.enqueue(job2);
someChannel.enqueue(job3);
```

You can push tasks above others by setting them as high-priority:

```typescript
import { ChannelQueue, TaskPriority } from "@buttercup-fork/channel-queue";

const queue = new ChannelQueue();
const workChannel = queue.channel("work");
// some other tasks added to the queue...
workChannel.enqueue(importantJobMethod, TaskPriority.High).then(result => {
    // 'result' is the resolved result from the 'importantJobMethod' function
});
```

Tasks can also be run as "low" priority or at the **tail** end of the queue:

```typescript
import { ChannelQueue, TaskPriority } from "@buttercup-fork/channel-queue";

const queue = new ChannelQueue();
const workChannel = queue.channel("work");
// some other tasks added to the queue...
workChannel.enqueue(runNearEnd, TaskPriority.Tail);
```

### Error Handling

Regardless whether an enqueued task fails or not, the channel will continue processing after it's done.

By default, if the task enqueued in `enqueue` throws an error, it will throw at the `enqueue` call:

```typescript
// The following throws:
await channel.enqueue(() => Promise.reject(new Error("Fails!")));
```

Always handle that promise. A failing task whose promise nobody awaits or catches is an unhandled rejection, and NodeJS ends the process on one by default:

```typescript
// Don't: if the task fails, NodeJS exits
channel.enqueue(mightFail);
// Do:
channel.enqueue(mightFail).catch(handleError);
```

You can disable enqueued functions throwing errors by setting `tasksThrow` to `false`:

```typescript
channel.tasksThrow = false;
// The following will not throw:
await channel.enqueue(() => Promise.reject(new Error("Fails!")));
```

Disabling this is really only useful if you use `waitForEmpty` with the `throwForFailures` set to `true`. This allows you to delay error handling until the channel is waited upon:

```typescript
channel.tasksThrow = false;
channel.enqueue(() => /* ... */)
channel.enqueue(() => Promise.reject(new Error("Fails!")));

// Later:
await channel.waitForEmpty({ throwForFailures: true });
```

`waitForEmpty({ throwForFailures: true })` rejects with the first failure since the last wait. Each failure is reported once, and at most 100 unreported failures are kept. Both options work the same on a `ParallelChannel`.

### Time Limits

`enqueue` takes an optional time limit in milliseconds as its fourth argument:

```typescript
import { ErrorCode } from "@buttercup-fork/channel-queue";
import { Layerr } from "layerr";

try {
    await channel.enqueue(slowTask, undefined, undefined, 5000);
} catch (err) {
    if (Layerr.info(err).code === ErrorCode.TaskTimeout) {
        // took longer than 5 s
    }
}
```

A time limit does **not** stop the task. When it runs out, the promise rejects and the channel starts the next task, but the timed-out function keeps running and its side effects still happen. Make the task itself stop (an `AbortSignal`, for example) if that matters.

### Stacking
Items can be "stacked": a stack name allows only 1 pending task in the queue. While a task with that stack name is still waiting, a new `enqueue` call with the same name adds nothing and returns the waiting task's promise. Once that task has started, the next call queues a new one. The stack is the third argument:

```typescript
import { ChannelQueue } from "@buttercup-fork/channel-queue";

const queue = new ChannelQueue();
const workChannel = queue.channel("work");

const promise1 = workChannel.enqueue(saveWorkFn, undefined, /* Stack ID */ "save");
const promise2 = workChannel.enqueue(saveWorkFn, undefined, "save");
const promise3 = workChannel.enqueue(saveWorkFn, undefined, "save");
// All three are the same promise: the first task had not started yet when
// the other two calls came, so saveWorkFn runs once
```

### Parallel Execution
Tasks can be run in parallel using the `ParallelChannel` class. You can create a parallel channel, in place of a regular channel, by calling `ChannelQueue#createParallelChannel`:

```typescript
import { ChannelQueue } from "@buttercup-fork/channel-queue";

const queue = new ChannelQueue();
const workChannel = queue.createParallelChannel("work");
workChannel.enqueue(someTask);

// The same channel can be fetched later using the familiar channel() method:
queue.channel("work"); // The parallel channel
```

Parallel channels, like their name implies, can run tasks in parallel. Instead of running them head-to-tail like regular channels, parallel channels can execute many tasks side-by-side. You can also limit them to a certain number of _threads_ (default is 2) by calling `queue.createParallelChannel("name", 5)` (where `5` is the maximum number of simultaneous tasks). A task added while the channel runs starts at once when a slot is free. `parallelism` must be a number of at least 1; anything else throws.

Parallel channels by default do not run tasks of different priorities simultaneously. This means that if the current running tasks are high-priority, no normal priority tasks will be started. This feature can be disabled by running `parallelChannel.canRunAcrossTaskTypes = true`.

### Waiting and Clearing

You can wait for a channel to empty (having all tasks completed) by using `waitForEmpty`:

```typescript
channel.enqueue(someTask);
channel.enqueue(someTask);

// Later:
await channel.waitForEmpty();
```

You can clear all enqueued items in a `Channel` by calling `clear()`:

```typescript
queue.channel("myChannel").clear();
// Or only one priority:
queue.channel("myChannel").clear(TaskPriority.Tail);
```

`clear()` removes tasks that have not started; running tasks finish as normal. The promise of each removed task rejects with an error whose code is `ErrorCode.TaskCleared`, so code awaiting it does not hang. A caller that kept no promise gets no unhandled rejection from this.

## Development & Supported Node Versions
This library needs NodeJS **22** or newer; CI tests NodeJS 22 and 24.

To contribute, clone this project and run `npm install` before beginning development.

To test, simply run `npm test`.
