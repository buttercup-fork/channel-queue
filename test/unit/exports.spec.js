import * as channelQueue from "../../dist/index.js";

describe("package exports", function () {
    it("exports what the apps import", function () {
        // core (VaultManager, VaultSource), desktop (FileStorage, log), extension (recents), mobile (otpAll)
        for (const name of [
            "ChannelQueue",
            "Channel",
            "ParallelChannel",
            "Task",
            "TaskPriority",
            "ErrorCode"
        ]) {
            expect(channelQueue, name).to.have.property(name);
        }
    });

    it("has the priority values the apps pass", function () {
        expect(channelQueue.TaskPriority).to.deep.equal({
            Normal: "normal",
            High: "high-priority",
            Tail: "tail"
        });
    });
});
