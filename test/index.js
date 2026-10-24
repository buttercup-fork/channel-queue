import * as chai from "chai";
import chaiAsPromised from "chai-as-promised";
import sinon from "sinon";

const { expect } = chai.use(chaiAsPromised);

Object.assign(globalThis, {
    expect,
    sinon
});
