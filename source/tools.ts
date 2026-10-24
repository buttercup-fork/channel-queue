import { Layerr } from "layerr";
import { ErrorCode } from "./types.js";

export function timeLimit<T>(promise: Promise<T>, time: number): Promise<T | void> {
    let timeout: ReturnType<typeof setTimeout>;
    return Promise.race([
        promise,
        new Promise<void>((_, reject) => {
            timeout = setTimeout(() => {
                reject(
                    new Layerr(
                        {
                            info: {
                                code: ErrorCode.TaskTimeout
                            }
                        },
                        `Timed-out waiting for task: ${time} ms`
                    )
                );
            }, time);
        })
    ]).finally(() => {
        // Whether the task finished, failed or timed out, the timer must not stay behind
        clearTimeout(timeout);
    });
}
