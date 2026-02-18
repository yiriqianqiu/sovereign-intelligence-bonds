import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("X402PaymentReceiver", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, unused, payer1, payer2] = await ethers.getSigners();

    // Deploy a mock controller that accepts receiveX402Payment(uint256)
    const MockController = await ethers.getContractFactory("MockX402Controller");
    const mockController = await MockController.deploy();

    const Receiver = await ethers.getContractFactory("X402PaymentReceiver");
    const receiver = await Receiver.deploy();
    await receiver.setController(await mockController.getAddress());

    return { receiver, mockController, ethers, owner, payer1, payer2 };
  }

  const ONE_ETHER = 10n ** 18n;
  const HALF_ETHER = 5n * 10n ** 17n;

  // -- Deployment --

  it("should deploy with correct owner", async () => {
    const { receiver, owner } = await deployFixture();
    assert.equal(await receiver.owner(), owner.address);
  });

  it("should set controller correctly", async () => {
    const { receiver, mockController } = await deployFixture();
    assert.equal(await receiver.controller(), await mockController.getAddress());
  });

  // -- Pay --

  it("should record payment correctly", async () => {
    const { receiver, payer1 } = await deployFixture();

    await receiver
      .connect(payer1)
      .pay(1, "/api/inference", { value: ONE_ETHER });

    const count = await receiver.getPaymentCount();
    assert.equal(count, 1n);

    const payment = await receiver.getPayment(0);
    assert.equal(payment.payer, payer1.address);
    assert.equal(payment.agentId, 1n);
    assert.equal(payment.endpoint, "/api/inference");
    assert.equal(payment.amount, ONE_ETHER);
  });

  it("should forward BNB to controller via receiveX402Payment", async () => {
    const { receiver, mockController, ethers, payer1 } = await deployFixture();

    const controllerAddr = await mockController.getAddress();
    const balBefore = await ethers.provider.getBalance(controllerAddr);

    await receiver
      .connect(payer1)
      .pay(1, "/api/inference", { value: ONE_ETHER });

    const balAfter = await ethers.provider.getBalance(controllerAddr);
    assert.equal(balAfter - balBefore, ONE_ETHER);

    // Verify the mock recorded the call
    const lastAgentId = await mockController.lastAgentId();
    assert.equal(lastAgentId, 1n);
    const lastAmount = await mockController.lastAmount();
    assert.equal(lastAmount, ONE_ETHER);
  });

  it("should track agentTotalPayments correctly", async () => {
    const { receiver, payer1, payer2 } = await deployFixture();

    await receiver
      .connect(payer1)
      .pay(1, "/api/inference", { value: ONE_ETHER });
    await receiver
      .connect(payer2)
      .pay(1, "/api/train", { value: HALF_ETHER });

    const total = await receiver.agentTotalPayments(1);
    assert.equal(total, ONE_ETHER + HALF_ETHER);
  });

  it("should accumulate multiple payments", async () => {
    const { receiver, payer1 } = await deployFixture();

    await receiver.connect(payer1).pay(1, "/api/a", { value: ONE_ETHER });
    await receiver.connect(payer1).pay(2, "/api/b", { value: HALF_ETHER });

    const count = await receiver.getPaymentCount();
    assert.equal(count, 2n);

    const agent1Total = await receiver.agentTotalPayments(1);
    assert.equal(agent1Total, ONE_ETHER);

    const agent2Total = await receiver.agentTotalPayments(2);
    assert.equal(agent2Total, HALF_ETHER);
  });

  it("should reject zero payment", async () => {
    const { receiver, payer1 } = await deployFixture();
    await assert.rejects(
      async () =>
        receiver.connect(payer1).pay(1, "/api/inference", { value: 0 }),
      /reverted/
    );
  });

  it("should reject payment when controller not set", async () => {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [, , payer1] = await ethers.getSigners();
    const Receiver = await ethers.getContractFactory("X402PaymentReceiver");
    const receiver = await Receiver.deploy();

    await assert.rejects(
      async () =>
        receiver.connect(payer1).pay(1, "/api/inference", { value: ONE_ETHER }),
      /reverted/
    );
  });

  // -- Access Control --

  it("should reject setController from non-owner", async () => {
    const { receiver, payer1 } = await deployFixture();
    await assert.rejects(
      async () => receiver.connect(payer1).setController(payer1.address),
      /OwnableUnauthorizedAccount/
    );
  });

  it("should reject setController with zero address", async () => {
    const { receiver, ethers } = await deployFixture();
    await assert.rejects(
      async () => receiver.setController(ethers.ZeroAddress),
      /zero address/
    );
  });

  // -- View Functions --

  it("should reject getPayment with out-of-bounds index", async () => {
    const { receiver } = await deployFixture();
    await assert.rejects(
      async () => receiver.getPayment(0),
      /index out of bounds/
    );
  });

  // -- Event Emission --

  it("should emit PaymentReceived event", async () => {
    const { receiver, payer1 } = await deployFixture();

    const tx = await receiver
      .connect(payer1)
      .pay(1, "/api/inference", { value: ONE_ETHER });
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log: any) => {
      try {
        return receiver.interface.parseLog(log)?.name === "PaymentReceived";
      } catch {
        return false;
      }
    });
    assert.ok(event, "PaymentReceived event should be emitted");

    const parsed = receiver.interface.parseLog(event!);
    assert.equal(parsed!.args.payer, payer1.address);
    assert.equal(parsed!.args.agentId, 1n);
    assert.equal(parsed!.args.amount, ONE_ETHER);
  });
});
