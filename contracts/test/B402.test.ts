import { describe, it } from "node:test";
import assert from "node:assert/strict";
import hre from "hardhat";

describe("B402PaymentReceiver", function () {
  async function deployFixture() {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [owner, relayer, payer1, payer2] = await ethers.getSigners();

    // Deploy mock controller that accepts BNB and ERC20
    const MockControllerV2 = await ethers.getContractFactory("MockControllerV2");
    const mockController = await MockControllerV2.deploy();

    // Deploy mock ERC20 token
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const token = await MockERC20.deploy("Test USDT", "USDT", 18);

    // Deploy B402 receiver
    const Receiver = await ethers.getContractFactory("B402PaymentReceiver");
    const receiver = await Receiver.deploy();
    await receiver.setController(await mockController.getAddress());

    // Mint tokens to payers
    await token.mint(payer1.address, ONE_ETHER * 100n);
    await token.mint(payer2.address, ONE_ETHER * 100n);

    // Approve receiver to spend tokens
    const receiverAddr = await receiver.getAddress();
    await token.connect(payer1).approve(receiverAddr, ONE_ETHER * 100n);
    await token.connect(payer2).approve(receiverAddr, ONE_ETHER * 100n);

    return { receiver, mockController, token, ethers, owner, relayer, payer1, payer2 };
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

  it("should have zero initial payment count", async () => {
    const { receiver } = await deployFixture();
    assert.equal(await receiver.getPaymentCount(), 0n);
  });

  it("should expose DOMAIN_SEPARATOR", async () => {
    const { receiver } = await deployFixture();
    const ds = await receiver.DOMAIN_SEPARATOR();
    assert.ok(ds.length > 0, "DOMAIN_SEPARATOR should be non-empty");
  });

  // -- payBNB (direct) --

  it("should record BNB payment correctly", async () => {
    const { receiver, payer1 } = await deployFixture();

    await receiver.connect(payer1).payBNB(1, "/api/inference", { value: ONE_ETHER });

    const count = await receiver.getPaymentCount();
    assert.equal(count, 1n);

    const payment = await receiver.getPayment(0);
    assert.equal(payment.payer, payer1.address);
    assert.equal(payment.agentId, 1n);
    assert.equal(payment.endpoint, "/api/inference");
    assert.equal(payment.token, "0x0000000000000000000000000000000000000000");
    assert.equal(payment.amount, ONE_ETHER);
  });

  it("should forward BNB to controller via receiveB402PaymentBNB", async () => {
    const { receiver, mockController, ethers, payer1 } = await deployFixture();

    const controllerAddr = await mockController.getAddress();
    const balBefore = await ethers.provider.getBalance(controllerAddr);

    await receiver.connect(payer1).payBNB(1, "/api/inference", { value: ONE_ETHER });

    const balAfter = await ethers.provider.getBalance(controllerAddr);
    assert.equal(balAfter - balBefore, ONE_ETHER);

    const lastAgentId = await mockController.lastAgentId();
    assert.equal(lastAgentId, 1n);
    const lastAmount = await mockController.lastBNBAmount();
    assert.equal(lastAmount, ONE_ETHER);
  });

  it("should track BNB agentTotalPayments correctly", async () => {
    const { receiver, ethers, payer1, payer2 } = await deployFixture();

    await receiver.connect(payer1).payBNB(1, "/api/inference", { value: ONE_ETHER });
    await receiver.connect(payer2).payBNB(1, "/api/train", { value: HALF_ETHER });

    const total = await receiver.agentTotalPayments(1, ethers.ZeroAddress);
    assert.equal(total, ONE_ETHER + HALF_ETHER);
  });

  it("should reject zero BNB payment", async () => {
    const { receiver, payer1 } = await deployFixture();
    await assert.rejects(
      async () => receiver.connect(payer1).payBNB(1, "/api/inference", { value: 0 }),
      /reverted/
    );
  });

  it("should reject BNB payment when controller not set", async () => {
    const connection = await hre.network.connect();
    const { ethers } = connection;
    const [, , payer1] = await ethers.getSigners();
    const Receiver = await ethers.getContractFactory("B402PaymentReceiver");
    const receiver = await Receiver.deploy();

    await assert.rejects(
      async () => receiver.connect(payer1).payBNB(1, "/api/inference", { value: ONE_ETHER }),
      /reverted/
    );
  });

  // -- payERC20 (direct) --

  it("should record ERC20 payment correctly", async () => {
    const { receiver, token, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();

    await receiver.connect(payer1).payERC20(1, tokenAddr, ONE_ETHER, "/api/inference");

    const count = await receiver.getPaymentCount();
    assert.equal(count, 1n);

    const payment = await receiver.getPayment(0);
    assert.equal(payment.payer, payer1.address);
    assert.equal(payment.agentId, 1n);
    assert.equal(payment.endpoint, "/api/inference");
    assert.equal(payment.token, tokenAddr);
    assert.equal(payment.amount, ONE_ETHER);
  });

  it("should transfer ERC20 tokens to controller", async () => {
    const { receiver, mockController, token, payer1 } = await deployFixture();
    const controllerAddr = await mockController.getAddress();

    const balBefore = await token.balanceOf(controllerAddr);
    await receiver.connect(payer1).payERC20(1, await token.getAddress(), ONE_ETHER, "/api/inference");
    const balAfter = await token.balanceOf(controllerAddr);

    assert.equal(balAfter - balBefore, ONE_ETHER);

    const lastAgentId = await mockController.lastAgentId();
    assert.equal(lastAgentId, 1n);
    const lastToken = await mockController.lastToken();
    assert.equal(lastToken, await token.getAddress());
    const lastAmount = await mockController.lastERC20Amount();
    assert.equal(lastAmount, ONE_ETHER);
  });

  it("should track ERC20 agentTotalPayments correctly", async () => {
    const { receiver, token, payer1, payer2 } = await deployFixture();
    const tokenAddr = await token.getAddress();

    await receiver.connect(payer1).payERC20(1, tokenAddr, ONE_ETHER, "/api/inference");
    await receiver.connect(payer2).payERC20(1, tokenAddr, HALF_ETHER, "/api/train");

    const total = await receiver.agentTotalPayments(1, tokenAddr);
    assert.equal(total, ONE_ETHER + HALF_ETHER);
  });

  it("should reject zero ERC20 payment", async () => {
    const { receiver, token, payer1 } = await deployFixture();
    await assert.rejects(
      async () => receiver.connect(payer1).payERC20(1, await token.getAddress(), 0, "/api/inference"),
      /reverted/
    );
  });

  it("should reject ERC20 payment with zero token address", async () => {
    const { receiver, ethers, payer1 } = await deployFixture();
    await assert.rejects(
      async () => receiver.connect(payer1).payERC20(1, ethers.ZeroAddress, ONE_ETHER, "/api/inference"),
      /reverted/
    );
  });

  // -- Mixed payments --

  it("should accumulate BNB and ERC20 payments separately", async () => {
    const { receiver, token, ethers, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();

    await receiver.connect(payer1).payBNB(1, "/api/a", { value: ONE_ETHER });
    await receiver.connect(payer1).payERC20(1, tokenAddr, HALF_ETHER, "/api/b");

    const count = await receiver.getPaymentCount();
    assert.equal(count, 2n);

    const bnbTotal = await receiver.agentTotalPayments(1, ethers.ZeroAddress);
    assert.equal(bnbTotal, ONE_ETHER);

    const erc20Total = await receiver.agentTotalPayments(1, tokenAddr);
    assert.equal(erc20Total, HALF_ETHER);
  });

  // -- EIP-712 Signed Payment (b402 Relayer) --

  it("should accept valid EIP-712 signed payment", async () => {
    const { receiver, mockController, token, ethers, owner, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();

    // Get chain ID and domain separator params
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const nonce = await receiver.nonces(payer1.address);
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    // Build EIP-712 typed data
    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId: chainId,
      verifyingContract: receiverAddr,
    };

    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const value = {
      payer: payer1.address,
      agentId: 1n,
      token: tokenAddr,
      amount: ONE_ETHER,
      endpoint: "/api/inference",
      nonce: nonce,
      deadline: deadline,
    };

    // Sign with payer1
    const signature = await payer1.signTypedData(domain, types, value);

    // Owner (as relayer) submits the signed payment
    const controllerAddr = await mockController.getAddress();
    const balBefore = await token.balanceOf(controllerAddr);

    await receiver.connect(owner).payWithSignature(
      payer1.address,
      1n,
      tokenAddr,
      ONE_ETHER,
      "/api/inference",
      deadline,
      signature
    );

    const balAfter = await token.balanceOf(controllerAddr);
    assert.equal(balAfter - balBefore, ONE_ETHER, "Controller should receive tokens");

    const count = await receiver.getPaymentCount();
    assert.equal(count, 1n);

    const payment = await receiver.getPayment(0);
    assert.equal(payment.payer, payer1.address);
    assert.equal(payment.agentId, 1n);
    assert.equal(payment.token, tokenAddr);
    assert.equal(payment.amount, ONE_ETHER);
  });

  it("should increment nonce after signed payment", async () => {
    const { receiver, token, ethers, owner, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId,
      verifyingContract: receiverAddr,
    };
    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    assert.equal(await receiver.nonces(payer1.address), 0n);

    const sig = await payer1.signTypedData(domain, types, {
      payer: payer1.address,
      agentId: 1n,
      token: tokenAddr,
      amount: HALF_ETHER,
      endpoint: "/api/a",
      nonce: 0n,
      deadline,
    });

    await receiver.connect(owner).payWithSignature(
      payer1.address, 1n, tokenAddr, HALF_ETHER, "/api/a", deadline, sig
    );

    assert.equal(await receiver.nonces(payer1.address), 1n);
  });

  it("should reject replay of signed payment (nonce used)", async () => {
    const { receiver, token, ethers, owner, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId,
      verifyingContract: receiverAddr,
    };
    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const sig = await payer1.signTypedData(domain, types, {
      payer: payer1.address, agentId: 1n, token: tokenAddr,
      amount: HALF_ETHER, endpoint: "/api/a", nonce: 0n, deadline,
    });

    // First call succeeds
    await receiver.connect(owner).payWithSignature(
      payer1.address, 1n, tokenAddr, HALF_ETHER, "/api/a", deadline, sig
    );

    // Replay with same signature fails (nonce incremented)
    await assert.rejects(
      async () => receiver.connect(owner).payWithSignature(
        payer1.address, 1n, tokenAddr, HALF_ETHER, "/api/a", deadline, sig
      ),
      /reverted/
    );
  });

  it("should reject expired signature", async () => {
    const { receiver, token, ethers, owner, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const pastDeadline = 1n; // already expired

    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId,
      verifyingContract: receiverAddr,
    };
    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const sig = await payer1.signTypedData(domain, types, {
      payer: payer1.address, agentId: 1n, token: tokenAddr,
      amount: ONE_ETHER, endpoint: "/api/a", nonce: 0n, deadline: pastDeadline,
    });

    await assert.rejects(
      async () => receiver.connect(owner).payWithSignature(
        payer1.address, 1n, tokenAddr, ONE_ETHER, "/api/a", pastDeadline, sig
      ),
      /reverted/
    );
  });

  it("should reject signature from wrong signer", async () => {
    const { receiver, token, ethers, owner, payer1, payer2 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId,
      verifyingContract: receiverAddr,
    };
    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    // payer2 signs, but we claim payer1 is the payer
    const sig = await payer2.signTypedData(domain, types, {
      payer: payer1.address, agentId: 1n, token: tokenAddr,
      amount: ONE_ETHER, endpoint: "/api/a", nonce: 0n, deadline,
    });

    await assert.rejects(
      async () => receiver.connect(owner).payWithSignature(
        payer1.address, 1n, tokenAddr, ONE_ETHER, "/api/a", deadline, sig
      ),
      /reverted/
    );
  });

  // -- Relay Authorization --

  it("should restrict payments when relayRestricted is true", async () => {
    const { receiver, payer1, owner } = await deployFixture();

    await receiver.setRelayRestricted(true);

    // payer1 is not an authorized relay
    await assert.rejects(
      async () => receiver.connect(payer1).payBNB(1, "/api/a", { value: ONE_ETHER }),
      /unauthorized relay/
    );

    // Authorize payer1
    await receiver.setAuthorizedRelay(payer1.address, true);
    await receiver.connect(payer1).payBNB(1, "/api/a", { value: ONE_ETHER });
    assert.equal(await receiver.getPaymentCount(), 1n);
  });

  it("should allow unrestricted payments by default", async () => {
    const { receiver, payer1 } = await deployFixture();
    assert.equal(await receiver.relayRestricted(), false);
    await receiver.connect(payer1).payBNB(1, "/api/a", { value: ONE_ETHER });
    assert.equal(await receiver.getPaymentCount(), 1n);
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

  it("should reject setAuthorizedRelay from non-owner", async () => {
    const { receiver, payer1 } = await deployFixture();
    await assert.rejects(
      async () => receiver.connect(payer1).setAuthorizedRelay(payer1.address, true),
      /OwnableUnauthorizedAccount/
    );
  });

  // -- View Functions --

  it("should reject getPayment with out-of-bounds index", async () => {
    const { receiver } = await deployFixture();
    await assert.rejects(
      async () => receiver.getPayment(0),
      /out of bounds/
    );
  });

  // -- Event Emission --

  it("should emit PaymentReceived event for BNB", async () => {
    const { receiver, payer1 } = await deployFixture();

    const tx = await receiver.connect(payer1).payBNB(1, "/api/inference", { value: ONE_ETHER });
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log: any) => {
      try {
        return receiver.interface.parseLog(log)?.name === "PaymentReceived";
      } catch {
        return false;
      }
    });
    assert.ok(event, "PaymentReceived event should be emitted");
  });

  it("should emit SignedPaymentReceived event for signed payment", async () => {
    const { receiver, token, ethers, owner, payer1 } = await deployFixture();
    const tokenAddr = await token.getAddress();
    const receiverAddr = await receiver.getAddress();
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

    const domain = {
      name: "B402PaymentReceiver",
      version: "1",
      chainId,
      verifyingContract: receiverAddr,
    };
    const types = {
      Payment: [
        { name: "payer", type: "address" },
        { name: "agentId", type: "uint256" },
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
        { name: "endpoint", type: "string" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    };

    const sig = await payer1.signTypedData(domain, types, {
      payer: payer1.address, agentId: 1n, token: tokenAddr,
      amount: ONE_ETHER, endpoint: "/api/a", nonce: 0n, deadline,
    });

    const tx = await receiver.connect(owner).payWithSignature(
      payer1.address, 1n, tokenAddr, ONE_ETHER, "/api/a", deadline, sig
    );
    const receipt = await tx.wait();

    const event = receipt!.logs.find((log: any) => {
      try {
        return receiver.interface.parseLog(log)?.name === "SignedPaymentReceived";
      } catch {
        return false;
      }
    });
    assert.ok(event, "SignedPaymentReceived event should be emitted");

    const parsed = receiver.interface.parseLog(event!);
    assert.equal(parsed!.args.payer, payer1.address);
    assert.equal(parsed!.args.relayer, owner.address);
  });
});
