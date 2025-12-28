import { expect } from "chai";
import hre, { ethers } from "hardhat";
const { parseUnits, toBeHex } = ethers;
// import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { mine, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import {
  AaveDIVAWrapper,
  IAave,
  IPoolAddressesProvider,
  IDIVA,
  MockERC20,
  ERC20,
  WToken,
} from "../typechain-types";
import {
  SetupOutput,
  CreateContingentPoolParams,
  AddLiquidityParams,
  RemoveLiquidityParams,
  SetupWithPoolResult,
  SetupWithConfirmedPoolResult,
} from "../constants/types";
import { DIVA_ADDRESS, AAVE_ADDRESS_PROVIDER } from "../utils/addresses";
import { getExpiryTime, getLastTimestamp } from "../utils/blocktime";
import {
  getPoolIdFromAaveDIVAWrapperEvent,
  getPoolIdFromDIVAEvent,
} from "../utils/eventUtils";
import { calcTotalDIVAFee } from "../utils/diva";
import { NETWORK_CONFIGS } from "../utils/addresses";
import { NETWORK } from "../hardhat.config";

// Get network hardhat.config.ts
const network = NETWORK;
const networkConfig = NETWORK_CONFIGS[network];

// Configure test collateral token and holder account to impersonate.
// Note: The holder account must have sufficient balance of the collateral token.
// IMPORTANT: The token key (e.g. 'USDT') must be the same for both collateralToken and collateralTokenHolder
// to ensure they match.
const collateralToken = networkConfig.collateralTokens.USDT.address;
const collateralTokenHolder = networkConfig.collateralTokens.USDT.holder;
const collateralTokenUnsupported = networkConfig.unsupportedToken.address;

// Second collateral token used for testing batch registration functionality.
// IMPORTANT: Must differ from first token to avoid duplicate registration errors.
const collateralToken2 = networkConfig.collateralTokens.USDC.address;

const divaAddress = DIVA_ADDRESS[network];
const aaveAddressProvider = AAVE_ADDRESS_PROVIDER[network];
let poolAddress: string;



describe("AaveDIVAWrapper", function () {
  before(async () => {
    const poolAddressesProvider: IPoolAddressesProvider = await ethers.getContractAt("IPoolAddressesProvider", aaveAddressProvider);
    poolAddress = await poolAddressesProvider.getPool();
    console.log("Aave V3 Pool:", poolAddress);
  });

  // Test setup function
  async function setup(): Promise<SetupOutput> {
    // Get the Signers
    const [owner, acc2, acc3, dataProvider] = await ethers.getSigners();

    // Impersonate account
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [collateralTokenHolder],
    });

    const impersonatedSigner = await ethers.getSigner(collateralTokenHolder);
    // Now `impersonatedSigner` can be used to send transactions from the impersonated account

    // Create a new contract instance to interact with the collateral token
    const collateralTokenContract: ERC20 = await ethers.getContractAt(
      "ERC20",
      collateralToken,
    );

    // Get the decimals of the collateral token
    const collateralTokenDecimals = Number(
      await collateralTokenContract.decimals(),
    );

    // Confirm that the balance is greater than 1000.
    const balance = await collateralTokenContract.balanceOf(
      impersonatedSigner.address,
    );
    expect(balance).to.be.gt(parseUnits("1000", collateralTokenDecimals));

    // Generate a dummy token and send it to owner
    const dummyTokenDecimals = 18;
    const dummyTokenContract: MockERC20 = await ethers.deployContract(
      "MockERC20",
      [
        "DummyToken", // name
        "DT", // symbol
        ethers.parseUnits("10000", dummyTokenDecimals), // totalSupply
        owner.address, // recipient
        dummyTokenDecimals, // decimals
        0, // feePct
      ],
    );
    await dummyTokenContract.waitForDeployment();

    // Deploy AaveDIVAWrapper contract
    const aaveDIVAWrapper: AaveDIVAWrapper = await ethers.deployContract(
      "AaveDIVAWrapper",
      [aaveAddressProvider, divaAddress, owner.address],
    );
    await aaveDIVAWrapper.waitForDeployment();

    // Connect to DIVA and Aave contract instances
    const diva: IDIVA = await ethers.getContractAt("IDIVA", divaAddress);
    const aave: IAave = await ethers.getContractAt("IAave", poolAddress);

    // Approve AaveDIVAWrapper contract with impersonatedSigner
    await collateralTokenContract
      .connect(impersonatedSigner)
      .approve(aaveDIVAWrapper.target, ethers.MaxUint256);

    // Approve DIVA contract with impersonatedSigner
    await collateralTokenContract
      .connect(impersonatedSigner)
      .approve(diva.target, ethers.MaxUint256);

    // Default create contingent pool parameters. Can be inherited via the spread operator
    // inside the tests and overridden as needed.
    const createContingentPoolParams: CreateContingentPoolParams = {
      referenceAsset: "BTC/USD",
      expiryTime: await getExpiryTime(60 * 60 * 2),
      floor: parseUnits("100"),
      inflection: parseUnits("150"),
      cap: parseUnits("200"),
      gradient: parseUnits("0.5", collateralTokenDecimals),
      collateralAmount: parseUnits("100", collateralTokenDecimals),
      collateralToken: collateralToken,
      dataProvider: dataProvider.address,
      capacity: ethers.MaxUint256,
      longRecipient: impersonatedSigner.address,
      shortRecipient: impersonatedSigner.address,
      permissionedERC721Token: ethers.ZeroAddress,
    };

    return {
      dummyTokenContract,
      dummyTokenDecimals,
      owner,
      acc2,
      acc3,
      dataProvider,
      impersonatedSigner,
      collateralTokenContract,
      collateralTokenDecimals,
      aaveDIVAWrapper,
      aave,
      diva,
      createContingentPoolParams,
    };
  }

  async function setupWithPool(): Promise<SetupWithPoolResult> {
    // Fetch setup fixture.
    const s: SetupOutput = await loadFixture(setup);

    // Register the collateral token and connect to wToken contract.
    await s.aaveDIVAWrapper
      .connect(s.owner)
      .registerCollateralToken(collateralToken);
    const wTokenAddress: string =
      await s.aaveDIVAWrapper.getWToken(collateralToken);
    const wTokenContract: WToken = await ethers.getContractAt(
      "WToken",
      wTokenAddress,
    );

    // Connect to the aToken contract associated with the collateral token.
    const aTokenAddress: string =
      await s.aaveDIVAWrapper.getAToken(collateralToken);
    const aTokenContract: ERC20 = await ethers.getContractAt(
      "IERC20",
      aTokenAddress,
    );

    // Fund impersonatedSigner with native token (e.g., MATIC on Polygon) to be able to pay for gas.
    await hre.network.provider.send("hardhat_setBalance", [
      s.impersonatedSigner.address,
      toBeHex(parseUnits("10", 18)), // Sending 10 native tokens
    ]);

    // Create a new contingent pool via the AaveDIVAWrapper contract.
    await s.aaveDIVAWrapper
      .connect(s.impersonatedSigner)
      .createContingentPool(s.createContingentPoolParams);

    // Fetch the poolId from the event and fetch pool parameters from DIVA Protocol.
    const poolId: string = await getPoolIdFromAaveDIVAWrapperEvent(
      s.aaveDIVAWrapper,
    );
    const poolParams: IDIVA.PoolStructOutput =
      await s.diva.getPoolParameters(poolId);

    // Connect to the short and long token contracts.
    const shortTokenContract: ERC20 = await ethers.getContractAt(
      "ERC20",
      poolParams.shortToken,
    );
    const longTokenContract: ERC20 = await ethers.getContractAt(
      "ERC20",
      poolParams.longToken,
    );

    // Approve the AaveDIVAWrapper contract to transfer the short and long tokens.
    await shortTokenContract
      .connect(s.impersonatedSigner)
      .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);
    await longTokenContract
      .connect(s.impersonatedSigner)
      .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);

    // Default parameters for removeLiquidity function.
    const r: RemoveLiquidityParams = {
      poolId: poolId,
      positionTokenAmount: parseUnits("10", s.collateralTokenDecimals),
      recipient: s.impersonatedSigner.address,
    };

    // Default parameters for addLiquidity function.
    const a: AddLiquidityParams = {
      poolId: poolId,
      collateralAmount: parseUnits("10", s.collateralTokenDecimals),
      longRecipient: s.impersonatedSigner.address,
      shortRecipient: s.impersonatedSigner.address,
    };

    // Calculate DIVA fee (claimable after the pool has been confirmed inside DIVA Protocol).
    const divaFees = await calcTotalDIVAFee(
      s.diva,
      poolParams,
      BigInt(r.positionTokenAmount),
      s.collateralTokenDecimals,
    );

    // Make some assertion to ensure that the setup satisfies required conditions.
    expect(r.positionTokenAmount).to.be.lt(
      s.createContingentPoolParams.collateralAmount,
    );
    expect(divaFees).to.gt(0);

    return {
      s,
      wTokenContract,
      wTokenAddress,
      aTokenContract,
      aTokenAddress,
      poolId,
      poolParams,
      shortTokenContract,
      longTokenContract,
      r,
      divaFees,
      a,
    };
  }

  async function setupWithConfirmedPool(): Promise<SetupWithConfirmedPoolResult> {
    // Use the existing `setupWithPool` function to set up the initial environment and create a pool.
    const {
      s,
      poolId,
      poolParams,
      longTokenContract,
      shortTokenContract,
      wTokenContract,
      aTokenContract,
      divaFees,
    } = await setupWithPool();

    // Fast forward in time past the pool's expiration.
    const nextBlockTimestamp = Number(poolParams.expiryTime) + 1;
    await mine(nextBlockTimestamp);

    const finalReferenceValue = parseUnits("120");
    expect(finalReferenceValue).to.lt(poolParams.cap);
    expect(finalReferenceValue).to.gt(poolParams.floor);

    // Set the final reference value to confirm the pool.
    await s.diva
      .connect(s.dataProvider)
      .setFinalReferenceValue(poolId, finalReferenceValue, false); // Assuming '1' is a valid reference value

    // Fetch updated pool parameters to confirm the status.
    const updatedPoolParams = await s.diva.getPoolParameters(poolId);
    expect(updatedPoolParams.statusFinalReferenceValue).to.eq(3); // Confirming the pool status

    // Get long and short token balances of impersonatedSigner.
    const longTokenBalance = await longTokenContract.balanceOf(
      s.impersonatedSigner.address,
    );
    const shortTokenBalance = await shortTokenContract.balanceOf(
      s.impersonatedSigner.address,
    );

    // Get collateral token balance of impersonatedSigner.
    const collateralTokenBalance = await s.collateralTokenContract.balanceOf(
      s.impersonatedSigner.address,
    );

    // Get the wToken supply.
    const wTokenSupply = await wTokenContract.totalSupply();

    // Calculate the long and short token payouts and confirm that at least one of them is positive.
    // Payouts are already net of DIVA fees.
    const expectedLongTokenPayout =
      (updatedPoolParams.payoutLong * longTokenBalance) /
      parseUnits("1", s.collateralTokenDecimals);
    const expectedShortTokenPayout =
      (updatedPoolParams.payoutShort * shortTokenBalance) /
      parseUnits("1", s.collateralTokenDecimals);
    expect(expectedLongTokenPayout + expectedShortTokenPayout).to.be.gt(0);

    // Return the updated setup output including the confirmed pool parameters.
    return {
      s,
      poolId,
      poolParams: updatedPoolParams,
      longTokenContract,
      shortTokenContract,
      longTokenBalance,
      shortTokenBalance,
      collateralTokenBalance,
      wTokenSupply,
      wTokenContract,
      aTokenContract,
      divaFees,
      expectedLongTokenPayout,
      expectedShortTokenPayout,
    };
  }

  before(async function () {
    await mine(); // Workaround so that it uses the forked network. See discussion here: https://github.com/NomicFoundation/edr/issues/447; expected to be fixed in a future hardhat release
  });

  describe("Constructor", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);
    });

    it("Should initialize parameters at contract deployment", async () => {
      // ---------
      // Assert: Confirm that relevant variables are initialized correctly.
      // ---------
      const contractDetails = await s.aaveDIVAWrapper.getContractDetails();
      expect(contractDetails[0]).to.equal(divaAddress);
      expect(contractDetails[1]).to.equal(poolAddress);
      expect(contractDetails[2]).to.equal(s.owner.address);

      const addressProvider = await s.aaveDIVAWrapper.getAaveV3AddressProvider();
      expect(addressProvider).to.equal(aaveAddressProvider);
    });

    it("Should have zero accrued yield immediately after contract deployment before any collateral tokens are registered", async () => {
      // ---------
      // Assert: Confirm that the accrued yield is zero.
      // ---------
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield).to.eq(0);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `ZeroAddress` error if DIVA address is zero", async () => {
      await expect(
        ethers.deployContract("AaveDIVAWrapper", [
          ethers.ZeroAddress,
          aaveAddressProvider,
          s.owner.address,
        ]),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });

    it("Should revert with `ZeroAddress` error if Aave V3 address is zero", async () => {
      await expect(
        ethers.deployContract("AaveDIVAWrapper", [
          divaAddress,
          ethers.ZeroAddress,
          s.owner.address,
        ]),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });

    it("Should revert with `OwnableInvalidOwner` error if owner address is zero", async () => {
      await expect(
        ethers.deployContract("AaveDIVAWrapper", [
          divaAddress,
          aaveAddressProvider,
          ethers.ZeroAddress,
        ]),
      )
        .to.be.revertedWithCustomError(s.aaveDIVAWrapper, "OwnableInvalidOwner")
        .withArgs(ethers.ZeroAddress); // reverts inside openzeppelin's Ownable contract
    });
  });

  describe("getAToken", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);
    });

    it("Should return the same aTokenAddress as in Aave Protocol for a supported collateral token", async () => {
      // ---------
      // Arrange: Fetch the aToken address associated with the collateral token from the AaveDIVAWrapper contract and Aave Protocol.
      // ---------
      // Fetch aToken address from the AaveDIVAWrapper contract.
      const aTokenAddressAaveDIVAWrapper =
        await s.aaveDIVAWrapper.getAToken(collateralToken);
      expect(aTokenAddressAaveDIVAWrapper).to.not.eq(ethers.ZeroAddress);

      // Fetch the aToken address from Aave Protocol.
      const aTokenAddressAave = (await s.aave.getReserveData(collateralToken))
        .aTokenAddress;
      expect(aTokenAddressAave).to.not.eq(ethers.ZeroAddress);

      // ---------
      // Assert: Confirm that the aToken addresses are equal.
      // ---------
      expect(aTokenAddressAaveDIVAWrapper).to.eq(aTokenAddressAave);
    });

    it("Should return zero aToken address for an unsupported collateral token", async () => {
      // ---------
      // Act: Fetch the aToken address from the AaveDIVAWrapper contract using the unsupported collateral token.
      // ---------
      const aTokenAddress = await s.aaveDIVAWrapper.getAToken(
        collateralTokenUnsupported,
      );

      // ---------
      // Assert: Confirm that the aToken address is zero.
      // ---------
      expect(aTokenAddress).to.equal(ethers.ZeroAddress);
    });
  });

  describe("registerCollateralToken", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);
    });

    it("Should register a new collateral token", async () => {
      // ---------
      // Arrange: Confirm that the wToken address for an unregistered collateral token is zero.
      // ---------
      const wTokenAddressAaveDIVAWrapperBefore =
        await s.aaveDIVAWrapper.getWToken(collateralToken);
      expect(wTokenAddressAaveDIVAWrapperBefore).to.eq(ethers.ZeroAddress);

      // ---------
      // Act: Register collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);

      // ---------
      // Assert: Confirm that the wToken was created and associated with the registered collateral token.
      // ---------
      // Confirm that the wToken address is associated with the registered collateral token and no longer zero.
      const wTokenAddressAaveDIVAWrapperAfter =
        await s.aaveDIVAWrapper.getWToken(collateralToken);
      expect(wTokenAddressAaveDIVAWrapperAfter).to.not.eq(ethers.ZeroAddress);

      // Connect to the wToken contract and confirm that its address is associated with the expected collateral token address.
      const wTokenContract = await ethers.getContractAt(
        "WToken",
        wTokenAddressAaveDIVAWrapperAfter,
      );
      const collateralTokenAddressAaveDIVAWrapper =
        await s.aaveDIVAWrapper.getCollateralToken(wTokenContract.target);
      expect(collateralTokenAddressAaveDIVAWrapper).to.eq(collateralToken);
    });

    it("Should correctly initialize wToken with symbol, name, decimals and owner address", async () => {
      // ---------
      // Arrange: Register the collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);

      // ---------
      // Act: Retrieve the created wToken address and create a contract instance to interact with.
      // ---------
      const wTokenAddress = await s.aaveDIVAWrapper.getWToken(collateralToken);
      const wTokenContract = await ethers.getContractAt(
        "WToken",
        wTokenAddress,
      );

      // ---------
      // Assert: Check that the symbol, name, decimals, and owner are set correctly.
      // ---------
      const collateralTokenContract = await ethers.getContractAt(
        "ERC20",
        collateralToken,
      );
      const expectedSymbol = "w" + (await collateralTokenContract.symbol());
      const expectedDecimals = await collateralTokenContract.decimals();
      const expectedOwner = s.aaveDIVAWrapper.target;

      expect(await wTokenContract.symbol()).to.equal(expectedSymbol);
      expect(await wTokenContract.name()).to.equal(expectedSymbol);
      expect(await wTokenContract.decimals()).to.equal(expectedDecimals);
      expect(await wTokenContract.owner()).to.equal(expectedOwner);
    });

    it("Should initialize wToken with zero total supply", async () => {
      // ---------
      // Arrange: Register the collateral token to create and setup the wToken.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const wTokenAddress = await s.aaveDIVAWrapper.getWToken(collateralToken);
      const wTokenContract = await ethers.getContractAt(
        "WToken",
        wTokenAddress,
      );

      // ---------
      // Act: Retrieve the total supply of the wToken.
      // ---------
      const wTokenSupply = await wTokenContract.totalSupply();

      // ---------
      // Assert: Check that the total supply of the wToken is zero.
      // ---------
      expect(wTokenSupply).to.equal(0);
    });

    it("Should set unlimited allowance for wToken transfers to DIVA Protocol", async () => {
      // ---------
      // Arrange: Register the collateral token to create and setup the wToken.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const wTokenAddress = await s.aaveDIVAWrapper.getWToken(collateralToken);
      const wTokenContract = await ethers.getContractAt(
        "WToken",
        wTokenAddress,
      );

      // ---------
      // Act: Retrieve the allowance of the wToken for the DIVA contract.
      // ---------
      const wTokenAllowance = await wTokenContract.allowance(
        s.aaveDIVAWrapper.target,
        divaAddress,
      );

      // ---------
      // Assert: Check that the wToken has given unlimited approval to the DIVA contract.
      // ---------
      expect(wTokenAllowance).to.equal(ethers.MaxUint256);
    });

    it("Should set unlimited allowance for collateral token transfers to Aave V3 Pool contract", async () => {
      // ---------
      // Arrange: Register the collateral token and setup the necessary approvals.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );

      // ---------
      // Act: Retrieve the allowance of the collateral token for the Aave V3 contract.
      // ---------
      const collateralTokenAllowance = await collateralTokenContract.allowance(
        s.aaveDIVAWrapper.target,
        poolAddress,
      );

      // ---------
      // Assert: Check that the collateral token has given unlimited approval to the Aave V3 contract.
      // ---------
      expect(collateralTokenAllowance).to.equal(ethers.MaxUint256);
    });

    it("Should have zero accrued yield immediately after registering a collateral token", async () => {
      // ---------
      // Act: Register collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);

      // ---------
      // Assert: Confirm that the accrued yield is zero shortly after registration and after several blocks.
      // ---------
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield).to.eq(0);
    });

    it("Should have zero accrued yield after several blocks post-registration when no pools are created", async () => {
      // ---------
      // Arrange: Register collateral token and mine several blocks.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const nextBlockTimestamp = (await getLastTimestamp()) + 1000;
      await mine(nextBlockTimestamp);

      // ---------
      // Assert: Confirm that the accrued yield is still zero after several blocks.
      // ---------
      const accruedYieldAfterSeveralBlocks =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYieldAfterSeveralBlocks).to.eq(0);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `CollateralTokenAlreadyRegistered` error if collateral token is already registered", async () => {
      // ---------
      // Arrange: Register the collateral token once.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);

      // ---------
      // Act & Assert: Attempt to register the same collateral token again and expect a revert.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .registerCollateralToken(collateralToken),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenAlreadyRegistered",
      );
    });

    it("Should revert with `UnsupportedCollateralToken` error if collateral token is not supported by Aave V3", async () => {
      // ---------
      // Act & Assert: Attempt to register the collateral token that is not supported and expect a revert.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .registerCollateralToken(collateralTokenUnsupported),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "UnsupportedCollateralToken",
      );
    });

    it("Should revert with `UnsupportedCollateralToken` error if collateral token is the zero address", async () => {
      // ---------
      // Act & Assert: Attempt to register the zero address and expect a revert.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .registerCollateralToken(ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "UnsupportedCollateralToken",
      );
    });
  });

  describe("wToken", async () => {
    let s: SetupOutput;
    let wTokenContract: WToken;

    beforeEach(async () => {
      ({ s, wTokenContract } = await setupWithPool());
    });

    it("Should return the AaveDIVAWrapper contract address as the owner of the wToken", async () => {
      expect(await wTokenContract.owner()).to.eq(s.aaveDIVAWrapper.target);
    });

    it("Should not decrease wToken allowance when maximum is given", async () => {
      // ---------
      // Arrange: Deploy a new WToken (setting owner signer as the token owner without loss of generality).
      // ---------
      const wToken = await ethers.deployContract("WToken", [
        "wTEST",
        18,
        s.owner.address,
      ]);

      // Mint tokens to owner and give acc2 unlimited allowance to spend them
      const amountToTransfer = parseUnits("1", 18);
      await wToken.connect(s.owner).mint(s.owner.address, amountToTransfer);
      await wToken.connect(s.owner).approve(s.acc2.address, ethers.MaxUint256);

      // Confirm that allowance is unlimited
      const initialAllowance = await wToken.allowance(
        s.owner.address,
        s.acc2.address,
      );
      expect(initialAllowance).to.equal(ethers.MaxUint256);

      // ---------
      // Act: Transfer tokens using transferFrom
      // ---------
      await wToken
        .connect(s.acc2)
        .transferFrom(s.owner.address, s.acc2.address, amountToTransfer);

      // ---------
      // Assert: Confirm allowance hasn't changed
      // ---------
      const finalAllowance = await wToken.allowance(
        s.owner.address,
        s.acc2.address,
      );
      expect(finalAllowance).to.equal(ethers.MaxUint256);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with 'WToken: caller is not owner' error if AaveDIVAWrapper owner tries to mint wToken directly", async () => {
      // ---------
      // Act & Assert: Attempt to mint wToken with the owner of the AaveDIVAWrapper contract and expect it to revert.
      // ---------
      const amountToMint = parseUnits("1", s.collateralTokenDecimals);
      await expect(
        wTokenContract.connect(s.owner).mint(s.owner.address, amountToMint),
      ).to.be.revertedWith("WToken: caller is not owner");
    });

    it("Should revert with 'WToken: caller is not owner' error if any other non-owner account tries to mint wToken directly", async () => {
      // ---------
      // Act & Assert: Attempt to mint wToken with acc2 and expect it to revert.
      // ---------
      const amountToMint = parseUnits("1", s.collateralTokenDecimals);
      await expect(
        wTokenContract.connect(s.acc2).mint(s.acc2.address, amountToMint),
      ).to.be.revertedWith("WToken: caller is not owner");
    });

    it("Should revert with 'WToken: caller is not owner' error if AaveDIVAWrapper owner tries to burn wToken directly", async () => {
      // ---------
      // Act & Assert: Attempt to burn wToken with the owner of the AaveDIVAWrapper contract and expect it to revert.
      // ---------
      const amountToBurn = parseUnits("1", s.collateralTokenDecimals);
      await expect(
        wTokenContract.connect(s.owner).burn(s.owner.address, amountToBurn),
      ).to.be.revertedWith("WToken: caller is not owner");
    });

    it("Should revert with 'WToken: caller is not owner' error if any other non-owner account tries to burn wToken directly", async () => {
      // ---------
      // Act & Assert: Attempt to burn wToken with acc2 and expect it to revert.
      // ---------
      const amountToBurn = parseUnits("1", s.collateralTokenDecimals);
      await expect(
        wTokenContract.connect(s.acc2).burn(s.acc2.address, amountToBurn),
      ).to.be.revertedWith("WToken: caller is not owner");
    });
  });

  describe("createContingentPool", async () => {
    let s: SetupOutput;
    let wTokenContract: WToken;
    let aTokenContract: ERC20;

    beforeEach(async () => {
      ({ s, wTokenContract, aTokenContract } = await setupWithPool());
    });

    it("Should create a contingent pool with wToken as collateral and initialize all pool parameters correctly", async () => {
      // ---------
      // Act: Create a new contingent pool via AaveDIVAWrapper. Not using the one from setupWithPool() in order to capture the
      // exact block timestamp that will be used to confirm that the pool's statusTimestamp is set correctly.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // Extract poolId from AaveDIVAWrapper's PoolIssued event and get the pool parameters.
      const poolId = await getPoolIdFromAaveDIVAWrapperEvent(s.aaveDIVAWrapper);
      const poolParams = await s.diva.getPoolParameters(poolId);

      // Get the current block timestamp. Used to check whether `statusTimestamp` in pool parameters is set correctly.
      const currentBlockTimestamp = await getLastTimestamp();

      // ---------
      // Assert: Confirm that the pool parameters in DIVA Protocol were correctly initialized
      // ---------
      expect(poolParams.referenceAsset).to.eq(
        s.createContingentPoolParams.referenceAsset,
      );
      expect(poolParams.expiryTime).to.eq(
        s.createContingentPoolParams.expiryTime,
      );
      expect(poolParams.floor).to.eq(s.createContingentPoolParams.floor);
      expect(poolParams.inflection).to.eq(
        s.createContingentPoolParams.inflection,
      );
      expect(poolParams.cap).to.eq(s.createContingentPoolParams.cap);
      expect(poolParams.collateralToken).to.eq(wTokenContract.target); // Must be wToken here
      expect(poolParams.gradient).to.eq(s.createContingentPoolParams.gradient);
      expect(poolParams.collateralBalance).to.eq(
        s.createContingentPoolParams.collateralAmount,
      );
      expect(poolParams.shortToken).is.properAddress;
      expect(poolParams.longToken).is.properAddress;
      expect(poolParams.finalReferenceValue).to.eq(0);
      expect(poolParams.statusFinalReferenceValue).to.eq(0);
      expect(poolParams.payoutLong).to.eq(0);
      expect(poolParams.payoutShort).to.eq(0);
      expect(poolParams.statusTimestamp).to.eq(currentBlockTimestamp);
      expect(poolParams.dataProvider).to.eq(
        s.createContingentPoolParams.dataProvider,
      );
      expect(poolParams.capacity).to.eq(s.createContingentPoolParams.capacity);
    });

    it("Should correctly allocate long and short tokens to the specified recipient", async () => {
      // ---------
      // Arrange: Confirm that the long and short token recipient is the impersonated signer
      // (default in `createContingentPoolParams`).
      // ---------
      expect(s.createContingentPoolParams.longRecipient).to.eq(
        s.impersonatedSigner,
      );
      expect(s.createContingentPoolParams.shortRecipient).to.eq(
        s.impersonatedSigner,
      );

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---
      // Assert: Confirm that the recipient's long and short token balances increased by the collateral amount deposited.
      // ---
      // Extract poolId from AaveDIVAWrapper's PoolIssued event and get the pool parameters.
      const poolId = await getPoolIdFromAaveDIVAWrapperEvent(s.aaveDIVAWrapper);
      const poolParams = await s.diva.getPoolParameters(poolId);

      // Connect to the short and long token contracts.
      const shortTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.shortToken,
      );
      const longTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.longToken,
      );

      // Confirm that the short and long token recipient's position token balance increases by the collateral amount deposited.
      expect(
        await shortTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(s.createContingentPoolParams.collateralAmount);
      expect(
        await longTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(s.createContingentPoolParams.collateralAmount);
    });

    it("Should correctly allocate long and short tokens to different recipients", async () => {
      // ---------
      // Arrange: Overwrite the long and short token recipients in createContingentPoolParams.
      // ---------
      const modifiedCreateContingentPoolParams = {
        ...s.createContingentPoolParams,
        longRecipient: s.acc2.address,
        shortRecipient: s.acc3.address,
      };

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(modifiedCreateContingentPoolParams);

      // ---
      // Assert: Confirm that the recipients' long and short token balances increase by the collateral amount deposited.
      // ---
      // Extract poolId from DIVA Protocol's PoolIssued event and get the pool parameters.
      const poolId = await getPoolIdFromAaveDIVAWrapperEvent(s.aaveDIVAWrapper);
      const poolParams = await s.diva.getPoolParameters(poolId);

      // Connect to the short and long token contracts.
      const shortTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.shortToken,
      );
      const longTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.longToken,
      );

      // Confirm that the recipients' long and short token balances increase by the collateral amount deposited.
      expect(await shortTokenContract.balanceOf(s.acc3.address)).to.eq(
        modifiedCreateContingentPoolParams.collateralAmount,
      );
      expect(await longTokenContract.balanceOf(s.acc2.address)).to.eq(
        modifiedCreateContingentPoolParams.collateralAmount,
      );
    });

    it("Should not allocate any long or short tokens to AaveDIVAWrapper contract", async () => {
      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---
      // Assert: Confirm that the AaveDIVAWrapper contract's long and short token balances are zero.
      // ---
      // Extract poolId from AaveDIVAWrapper's PoolIssued event and get the pool parameters.
      const poolId = await getPoolIdFromAaveDIVAWrapperEvent(s.aaveDIVAWrapper);
      const poolParams = await s.diva.getPoolParameters(poolId);

      // Connect to the short and long token contracts.
      const shortTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.shortToken,
      );
      const longTokenContract = await ethers.getContractAt(
        "IERC20",
        poolParams.longToken,
      );

      // Confirm that the AaveDIVAWrapper contract's long and short token balances are zero.
      expect(
        await shortTokenContract.balanceOf(s.aaveDIVAWrapper.target),
      ).to.eq(0);
      expect(await longTokenContract.balanceOf(s.aaveDIVAWrapper.target)).to.eq(
        0,
      );
    });

    it("Should reduce the user's collateral token balance by the deposited amount", async () => {
      // ---------
      // Arrange: Get the collateral token balance of the user before creating a new contingent pool.
      // ---------
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that the user's collateral token balance was reduced by the collateral amount deposited.
      // ---------
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfter).to.eq(
        collateralTokenBalanceBefore -
          BigInt(s.createContingentPoolParams.collateralAmount),
      );
    });

    it("Should increase the wToken total supply by the deposited amount", async () => {
      // ---------
      // Arrange: Get the wToken supply before pool creation.
      // ---------
      const wTokenSupplyBefore = await wTokenContract.totalSupply();

      // Confirm that the collateral amount in createContingentPoolParams is greater than zero.
      expect(s.createContingentPoolParams.collateralAmount).to.be.gt(0);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that the wToken supply increased by the collateral amount deposited.
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(
        wTokenSupplyBefore + s.createContingentPoolParams.collateralAmount,
      );
    });

    it("Should increase DIVA Protocol's wToken balance by the deposited amount after creating a pool", async () => {
      // ---------
      // Arrange: Get the wToken balance of DIVA Protocol before pool creation.
      // ---------
      const wTokenBalanceDIVABefore =
        await wTokenContract.balanceOf(divaAddress);

      // Confirm that the collateral amount in createContingentPoolParams is greater than zero.
      expect(s.createContingentPoolParams.collateralAmount).to.be.gt(0);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that DIVA Protocol's wToken balance increased by the collateral amount deposited.
      // ---------
      const wTokenBalanceDIVAAfter =
        await wTokenContract.balanceOf(divaAddress);
      expect(wTokenBalanceDIVAAfter).to.eq(
        wTokenBalanceDIVABefore + s.createContingentPoolParams.collateralAmount,
      );
    });

    it("The AaveDIVAWrapper contract's wToken balance should be zero before and after pool creation", async () => {
      // ---------
      // Arrange: Confirm that the wToken balance of the AaveDIVAWrapper contract before pool creation is zero.
      // ---------
      const wTokenBalanceAaveDIVAWrapperBefore = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's wToken balance remains zero after pool creation.
      // ---------
      const wTokenBalanceAaveDIVAWrapperAfter = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's collateralToken balance should be zero before and after pool creation", async () => {
      // ---------
      // Arrange: Confirm that the collateralToken balance of the AaveDIVAWrapper contract before pool creation is zero.
      // ---------
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );
      const collateralTokenBalanceAaveDIVAWrapperBefore =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's collateralToken balance remains zero after pool creation.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperAfter =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("Should increase the AaveDIVAWrapper contract's aToken balance by the deposited amount after creating a pool", async () => {
      // ---------
      // Arrange: Get the aToken balance of AaveDIVAWrapper contract before pool creation.
      // ---------
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );

      // Confirm that the collateral amount in createContingentPoolParams is greater than zero.
      expect(s.createContingentPoolParams.collateralAmount).to.be.gt(0);

      // ---------
      // Act: Create a new contingent pool via the AaveDIVAWrapper contract.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // ---------
      // Assert: Confirm that the AaveDIVAWrapper contract's aToken balance increased by the collateral amount deposited.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore +
          s.createContingentPoolParams.collateralAmount,
        1,
      ); // using `closeTo` to account for yield that might have accrued since last block
    });

    it("Should accrue yield after creating a pool", async () => {
      // ---------
      // Arrange: Create pool and get initial yield.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      const initialYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);

      // ---------
      // Act: Mine blocks to simulate passage of time for yield accrual.
      // ---------
      await mine(10000);

      // ---------
      // Assert: Verify that yield has increased from initial amount.
      // ---------
      const laterYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(laterYield).to.be.gt(initialYield + BigInt(100)); // Using 100 as a random number to confirm that yield accrued
    });

    it("Should return a non-zero poolId when creating a pool", async () => {
      // ---------
      // Act: Create a pool using staticCall
      // ---------
      const poolId = await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool.staticCall(s.createContingentPoolParams);

      // ---------
      // Assert: Verify the returned poolId is non-zero
      // ---------
      expect(poolId).to.not.equal(ethers.ZeroHash);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------
    it("Should revert with `CollateralTokenNotRegistered` error if the collateral token is not registered", async () => {
      // ---------
      // Arrange: Create pool params with unregistered collateral token.
      // ---------
      const unregisteredCollateralToken =
        "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"; // Random token address
      const invalidPoolParams = {
        ...s.createContingentPoolParams,
        collateralToken: unregisteredCollateralToken,
      };

      // ---------
      // Act & Assert: Attempt to create pool with unregistered collateral token and verify it reverts.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .createContingentPool(invalidPoolParams),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit a `PoolIssued` event in AaveDIVAWrapper when creating a pool", async () => {
      // ---------
      // Act & Assert: Create pool and verify PoolIssued event is emitted with correct poolId.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .createContingentPool(s.createContingentPoolParams),
      )
        .to.emit(s.aaveDIVAWrapper, "PoolIssued")
        .withArgs((poolId: string) => poolId !== ethers.ZeroHash); // poolId is dynamic so we just check it's not zero bytes32
    });
  });

  describe("addLiquidity", async () => {
    let s: SetupOutput;
    let wTokenContract: WToken;
    let aTokenContract: ERC20;
    let shortTokenContract: ERC20;
    let longTokenContract: ERC20;
    let a: AddLiquidityParams;

    beforeEach(async () => {
      ({
        s,
        wTokenContract,
        aTokenContract,
        shortTokenContract,
        longTokenContract,
        a,
      } = await setupWithPool());
    });

    it("Should correctly allocate long and short tokens to the specified recipient", async () => {
      // ---------
      // Arrange: Get the initial balances of the long and short token recipient (impersonatedSigner by default).
      // ---------
      // Confirm that the long and short token recipient is the impersonated signer.
      expect(s.createContingentPoolParams.longRecipient).to.eq(
        s.impersonatedSigner,
      );
      expect(s.createContingentPoolParams.shortRecipient).to.eq(
        s.impersonatedSigner,
      );

      // Get the initial long and short token balances.
      const longTokenBalanceBefore = await longTokenContract.balanceOf(
        a.longRecipient,
      );
      const shortTokenBalanceBefore = await shortTokenContract.balanceOf(
        a.shortRecipient,
      );

      // ---------
      // Act: Add liquidity to the existing pool.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that the recipient's long and short token balances increased by the collateral amount deposited.
      // ---------
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        a.longRecipient,
      );
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        a.shortRecipient,
      );
      expect(longTokenBalanceAfter).to.eq(
        longTokenBalanceBefore + a.collateralAmount,
      );
      expect(shortTokenBalanceAfter).to.eq(
        shortTokenBalanceBefore + a.collateralAmount,
      );
    });

    it("Should correctly allocate long and short tokens to different recipients", async () => {
      // ---------
      // Arrange: Use acc2 and acc3 as long and short token recipients and get their initial position token balances.
      // ---------
      a.longRecipient = s.acc2.address;
      a.shortRecipient = s.acc3.address;
      const longTokenBalanceBefore = await longTokenContract.balanceOf(
        a.longRecipient,
      );
      const shortTokenBalanceBefore = await shortTokenContract.balanceOf(
        a.shortRecipient,
      );

      // ---------
      // Act: Add liquidity to the existing pool.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that the recipients' long and short token balances were updated correctly.
      // ---------
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        a.longRecipient,
      );
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        a.shortRecipient,
      );
      expect(longTokenBalanceAfter).to.eq(
        longTokenBalanceBefore + a.collateralAmount,
      );
      expect(shortTokenBalanceAfter).to.eq(
        shortTokenBalanceBefore + a.collateralAmount,
      );
    });

    it("Should reduce the user's collateral token balance by the deposited amount", async () => {
      // ---------
      // Arrange: Get the collateral token balance of the user before adding liquidity.
      // ---------
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Add liquidity to the existing pool.
      // ---------
      await s.aaveDIVAWrapper.connect(s.impersonatedSigner).addLiquidity(
        a.poolId,
        a.collateralAmount,
        a.longRecipient, // impersonatedSigner by default
        a.shortRecipient, // impersonatedSigner by default
      );

      // ---------
      // Assert: Confirm that the user's collateral token balance was reduced by the collateral amount deposited.
      // ---------
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfter).to.eq(
        collateralTokenBalanceBefore - BigInt(a.collateralAmount),
      );
    });

    it("Should increase the wToken total supply by the deposited amount", async () => {
      // ---------
      // Arrange: Get the wToken supply before adding liquidity.
      // ---------
      const wTokenSupplyBefore = await wTokenContract.totalSupply();

      // ---------
      // Act: Add liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that the wToken supply increased by the collateral amount deposited.
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(wTokenSupplyBefore + a.collateralAmount);
    });

    it("Should increase DIVA Protocol's wToken balance by the deposited amount after adding liquidity", async () => {
      // ---------
      // Arrange: Get the wToken balance of DIVA Protocol before adding liquidity.
      // ---------
      const wTokenBalanceDIVABefore =
        await wTokenContract.balanceOf(divaAddress);

      // ---------
      // Act: Add liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that DIVA Protocol's wToken balance increased by the collateral amount deposited.
      // ---------
      const wTokenBalanceDIVAAfter =
        await wTokenContract.balanceOf(divaAddress);
      expect(wTokenBalanceDIVAAfter).to.eq(
        wTokenBalanceDIVABefore + a.collateralAmount,
      );
    });

    it("The AaveDIVAWrapper contract's wToken balance should be zero before and after adding liquidity", async () => {
      // ---------
      // Arrange: Confirm that the wToken balance of the AaveDIVAWrapper contract before adding liquidity is zero.
      // ---------
      const wTokenBalanceAaveDIVAWrapperBefore = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Add liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's wToken balance remains zero after adding liquidity.
      // ---------
      const wTokenBalanceAaveDIVAWrapperAfter = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's collateralToken balance should be zero before and after adding liquidity", async () => {
      // ---------
      // Arrange: Confirm that the collateralToken balance of the AaveDIVAWrapper contract before adding liquidity is zero.
      // ---------
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );
      const collateralTokenBalanceAaveDIVAWrapperBefore =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Add liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's collateralToken balance remains zero after adding liquidity.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperAfter =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("Should increase the AaveDIVAWrapper contract's aToken balance by the deposited amount after adding liquidity", async () => {
      // ---------
      // Arrange: Get the aToken balance of AaveDIVAWrapper contract before adding liquidity.
      // ---------
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );

      // ---------
      // Act: Add liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .addLiquidity(
          a.poolId,
          a.collateralAmount,
          a.longRecipient,
          a.shortRecipient,
        );

      // ---------
      // Assert: Confirm that the aToken balance of AaveDIVAWrapper contract increased by the collateral amount deposited.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore + a.collateralAmount, // closeTo to account for yield that might have accrued since last block
        1,
      );
    });

    // No need to test yield accrual here since it was already tested in createContingentPool
    // and we cannot meaningfully distinguish between yield from the initial deposit vs additional liquidity.

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `CollateralTokenNotRegistered` error if the collateral token is not registered", async () => {
      // ---------
      // Arrange: Create pool directly on DIVA Protocol using an unregistered token.
      // ---------
      // Confirm that dummy token (minted to owner at the beginning of the test suite) is not registered.
      const wTokenAddress = await s.aaveDIVAWrapper.getWToken(
        s.dummyTokenContract.target,
      );
      expect(wTokenAddress).to.eq(ethers.ZeroAddress);

      // Approve DIVA Protocol to transfer dummy token.
      await s.dummyTokenContract
        .connect(s.owner)
        .approve(divaAddress, ethers.MaxUint256);

      // Create pool with unregistered token directly on DIVA Protocol.
      await s.diva.connect(s.owner).createContingentPool({
        ...s.createContingentPoolParams,
        collateralToken: s.dummyTokenContract.target,
      });

      // Obtain poolId from DIVA event.
      const poolId = await getPoolIdFromDIVAEvent(s.diva);

      // ---------
      // Act & Assert: Attempt to add liquidity via AaveDIVAWrapper to pool with unregistered collateral token and verify it reverts.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .addLiquidity(
            poolId,
            a.collateralAmount,
            a.longRecipient,
            a.shortRecipient,
          ),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });
  });

  describe("removeLiquidity with outputAToken = false", async () => {
    let s: SetupOutput;
    let wTokenContract: WToken;
    let aTokenContract: ERC20;
    let shortTokenContract: ERC20;
    let longTokenContract: ERC20;
    let r: RemoveLiquidityParams;
    let divaFees: bigint;

    beforeEach(async () => {
      ({
        s,
        wTokenContract,
        aTokenContract,
        shortTokenContract,
        longTokenContract,
        r,
        divaFees,
      } = await setupWithPool());
      expect(r.positionTokenAmount).to.be.gt(0);
      expect(r.positionTokenAmount).to.be.lt(
        s.createContingentPoolParams.collateralAmount,
      );
      expect(divaFees).to.gt(0);
    });

    it("Should reduce the user's long and short token balances by the position token amount removed", async () => {
      // ---------
      // Arrange: Get the recipient's initial long and short token balances (impersonatedSigner created the pool inside
      // the beforeEach block and hence owns both tokens).
      // ---------
      const longTokenBalanceBefore = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalanceBefore = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalanceBefore).to.be.gt(0);
      expect(shortTokenBalanceBefore).to.be.gt(0);

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that the user's long and short token balances reduced by the position token amount removed.
      // ---------
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalanceAfter).to.eq(
        longTokenBalanceBefore - BigInt(r.positionTokenAmount),
      );
      expect(shortTokenBalanceAfter).to.eq(
        shortTokenBalanceBefore - BigInt(r.positionTokenAmount),
      );
    });

    it("Should increase the user's collateral token balance by the position token amount removed adjusted for DIVA fee", async () => {
      // ---------
      // Arrange: Get the collateral token balance of the user before removing liquidity.
      // ---------
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that the collateral token balance of the user increased by the position token amount removed adjusted for DIVA fee.
      // ---------
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfter).to.eq(
        collateralTokenBalanceBefore + BigInt(r.positionTokenAmount) - divaFees,
      );
    });

    it("Should reduce the wToken total supply by the position token amount removed adjusted for DIVA fee", async () => {
      // ---------
      // Arrange: Get the wToken supply before removing liquidity.
      // ---------
      const wTokenSupplyBefore = await wTokenContract.totalSupply();

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that the wToken supply reduced by the position token amount removed adjusted for DIVA fee.
      // The DIVA fee is allocated to the DIVA Protocol owner and is burnt only if claimed and redeemed via `redeemWToken`.
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(
        wTokenSupplyBefore - BigInt(r.positionTokenAmount) + divaFees,
      );
    });

    it("Should reduce DIVA Protocol's wToken balance by the position token amount removed adjusted for DIVA fee", async () => {
      // ---------
      // Arrange: Get DIVA Protocol's wToken balance before removing liquidity.
      // ---------
      const wTokenBalanceDIVABefore =
        await wTokenContract.balanceOf(divaAddress);

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that DIVA Protocol's wToken balance reduced by the position token amount removed adjusted for DIVA fee.
      // The DIVA fee is allocated to the DIVA Protocol owner and is burnt only if claimed and redeemed via `redeemWToken`.
      // ---------
      const wTokenBalanceDIVAAfter = await wTokenContract.balanceOf(
        s.diva.target,
      );
      expect(wTokenBalanceDIVAAfter).to.eq(
        wTokenBalanceDIVABefore - BigInt(r.positionTokenAmount) + divaFees,
      );
    });

    it("The AaveDIVAWrapper contract's wToken balance should be zero before and after removing liquidity", async () => {
      // ---------
      // Arrange: Confirm that the wToken balance of the AaveDIVAWrapper contract before removing liquidity is zero.
      // ---------
      const wTokenBalanceAaveDIVAWrapperBefore = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's wToken balance remains zero after removing liquidity.
      // ---------
      const wTokenBalanceAaveDIVAWrapperAfter = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's collateralToken balance should be zero before and after removing liquidity", async () => {
      // ---------
      // Arrange: Confirm that the collateralToken balance of the AaveDIVAWrapper contract before removing liquidity is zero.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperBefore =
        await s.collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's collateralToken balance remains zero after removing liquidity.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperAfter =
        await s.collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("Should remove long token balance amount when using `type(uint256).max` and long < short balance", async () => {
      // ---------
      // Arrange: Transfer some short tokens away from impersonatedSigner to create imbalance between long
      // and short token balances (long < short)
      // ---------
      const initialShortBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const initialLongBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(initialShortBalance).to.be.gt(0);
      expect(initialLongBalance).to.be.gt(0);

      const amountToTransfer = initialLongBalance / 2n;

      // Transfer half of long tokens to owner to create imbalance (long < short)
      await longTokenContract
        .connect(s.impersonatedSigner)
        .transfer(s.owner, amountToTransfer);

      // Verify imbalance was created and both balances are still > 0
      const shortBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const longBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(shortBalance).to.be.gt(0);
      expect(longBalance).to.be.gt(0);
      expect(longBalance).to.be.lt(shortBalance);

      // ---------
      // Act: Remove liquidity with `type(uint256).max`
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, ethers.MaxUint256, r.recipient, false);

      // ---------
      // Assert: Verify that user's long token balance is zero and short token balance is greater than zero
      // ---------
      const shortBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const longBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longBalanceAfter).to.eq(0);
      expect(shortBalanceAfter).to.be.gt(0);
    });

    it("Should remove short token balance amount when using `type(uint256).max` and short < long balance", async () => {
      // ---------
      // Arrange: Transfer some short tokens away from impersonatedSigner to create imbalance between long
      // and short token balances (short < long)
      // ---------
      const initialShortBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const initialLongBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(initialShortBalance).to.be.gt(0);
      expect(initialLongBalance).to.be.gt(0);

      const amountToTransfer = initialShortBalance / 2n;

      // Transfer half of short tokens to owner to create imbalance (short < long)
      await shortTokenContract
        .connect(s.impersonatedSigner)
        .transfer(s.owner, amountToTransfer);

      // Verify imbalance was created and both balances are still > 0
      const shortBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const longBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(shortBalance).to.be.gt(0);
      expect(longBalance).to.be.gt(0);
      expect(shortBalance).to.be.lt(longBalance);

      // ---------
      // Act: Remove liquidity with `type(uint256).max`
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, ethers.MaxUint256, r.recipient, false);

      // ---------
      // Assert: Verify that user's short token balance is zero and long token balance is greater than zero
      // ---------
      const shortBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const longBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(shortBalanceAfter).to.eq(0);
      expect(longBalanceAfter).to.be.gt(0);
    });

    it("Should reduce the AaveDIVAWrapper contract's aToken balance by the position token amount removed adjusted for DIVA fee", async () => {
      // ---------
      // Arrange: Get the aToken balance of AaveDIVAWrapper contract before removing liquidity.
      // ---------
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );

      // ---------
      // Act: Remove liquidity.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // ---------
      // Assert: Confirm that the aToken balance of AaveDIVAWrapper contract reduced by the position token amount removed adjusted for DIVA fee.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore -
          BigInt(r.positionTokenAmount) +
          divaFees,
        1,
      ); // closeTo to account for yield that might have accrued since last block
    });

    it("Should return the `_amountReturned` variable", async () => {
      // ---------
      // Arrange: Calculate expected return value.
      // ---------
      const expectedReturnValue = BigInt(r.positionTokenAmount) - divaFees;

      // ---------
      // Act: Remove liquidity.
      // ---------
      const returnedAmount = await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity.staticCall(
          r.poolId,
          r.positionTokenAmount,
          r.recipient,
          false,
        );

      // ---------
      // Assert: Confirm that the returned amount is correct.
      // ---------
      expect(returnedAmount).to.eq(expectedReturnValue);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `CollateralTokenNotRegistered` error if an invalid poolId is provided", async () => {
      // ---------
      // Arrange: Create a pool on DIVA Protocol with an invalid collateral token. Any non-wToken collateral token will do.
      // ---------
      // Confirm that the token to be used as collateral for the DIVA pool is not registered in AaveDIVAWrapper.
      const collateralTokenFromWToken =
        await s.aaveDIVAWrapper.getCollateralToken(s.dummyTokenContract.target);
      expect(collateralTokenFromWToken).to.eq(ethers.ZeroAddress);

      // Override the collateral token in the createContingentPoolParams with the dummy token.
      // Creating a new object to avoid modifying the original createContingentPoolParams.
      const modifiedCreateContingentPoolParams = {
        ...s.createContingentPoolParams,
        collateralToken: s.dummyTokenContract.target,
      };

      // Approve DIVA Protocol to transfer the dummy token.
      await s.dummyTokenContract
        .connect(s.owner)
        .approve(divaAddress, ethers.MaxUint256);

      // Update the expiry time to be 1 hour in the future in case the latest block timestamp is greater than the expiryTime
      // defined in `createContingentPoolParams`.
      const lastBlockTimestamp = await getLastTimestamp();
      modifiedCreateContingentPoolParams.expiryTime = (
        lastBlockTimestamp + 3600
      ).toString();

      // Create a new contingent pool via DIVA Protocol directly.
      await s.diva
        .connect(s.owner)
        .createContingentPool(modifiedCreateContingentPoolParams);

      // Get poolId of the newly created pool.
      const poolId = await getPoolIdFromDIVAEvent(s.diva);

      // ---------
      // Act & Assert: Attempt to remove liquidity with an invalid poolId.
      // ---------
      await expect(
        s.aaveDIVAWrapper.removeLiquidity(poolId, 1, s.owner.address, false),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });

    it("Should revert with `ZeroAddress` error if recipient is the zero address", async () => {
      // ---------
      // Arrange: Approve position tokens for AaveDIVAWrapper contract.
      // ---------
      await shortTokenContract
        .connect(s.impersonatedSigner)
        .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);
      await longTokenContract
        .connect(s.impersonatedSigner)
        .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);

      // ---------
      // Act & Assert: Attempt to remove liquidity with zero address recipient.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
        .removeLiquidity(
          r.poolId,
          r.positionTokenAmount,
          ethers.ZeroAddress,
          false,
        ),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });
  });

  describe("redeemWToken with outputAToken = false", async () => {
    let s: SetupOutput;
    let wTokenAddress: string;
    let wTokenContract: WToken;
    let poolId: string;
    let poolParams: IDIVA.PoolStructOutput;
    let r: RemoveLiquidityParams;
    let longTokenContract: ERC20;
    let shortTokenContract: ERC20;

    beforeEach(async () => {
      ({
        s,
        wTokenContract,
        wTokenAddress,
        longTokenContract,
        shortTokenContract,
        poolId,
        poolParams,
        r,
      } = await setupWithPool());
    });

    it("Should allow DIVA treasury to claim protocol fees in wToken and redeem them for collateral tokens", async () => {
      // ---------
      // Arrange: Simulate DIVA fee claim resulting in the DIVA treasury having to claim the wToken directly from the DIVA
      // Protocol contract and convert it into collateral token via the `redeemWToken` function.
      // ---------
      // Impersonate the DIVA Protocol treasury account, the account that is eligible to claim the fees inside DIVA Protocol.
      const divaTreasuryInfo = await s.diva.getTreasuryInfo();
      const treasuryAddress = divaTreasuryInfo.treasury;
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
      });
      const impersonatedDIVATreasurySigner =
        await ethers.getSigner(treasuryAddress);

      // Get the initial wToken and collateral token balances of the impersonatedDIVATreasurySigner.
      const wTokenBalanceBefore = await wTokenContract.balanceOf(
        impersonatedDIVATreasurySigner.address,
      );
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(
          impersonatedDIVATreasurySigner.address,
        );

      // Remove liquidity which allocates fees to the treasury account, claimable post pool expiry.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, false);

      // Fast forward in time past pool expiration and report outcome with data provider.
      // It's not relevant which value is reported here. Also, to simplify the test case, the
      // challenge functionality has been disabled, so that the value submission is immediately considered final/confirmed.
      const nextBlockTimestamp = Number(poolParams.expiryTime) + 1;
      await mine(nextBlockTimestamp);
      await s.diva
        .connect(s.dataProvider)
        .setFinalReferenceValue(poolId, "1", false);

      // Get updated pool parameters and confirm that the pool was confirmed (equivalent to statusFinalReferenceValue = 3).
      const poolParamsAfter = await s.diva.getPoolParameters(poolId);
      expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3);

      // Confirm that the DIVA treasury has a positive claim amount in wToken.
      const claimAmount = await s.diva.getClaim(
        wTokenAddress,
        impersonatedDIVATreasurySigner.address,
      );
      expect(claimAmount).to.gt(0);

      // Fund the impersonatedDIVATreasurySigner with MATIC to pay for gas.
      await hre.network.provider.send("hardhat_setBalance", [
        treasuryAddress,
        toBeHex(parseUnits("10", 18)), // Sending 10 MATIC
      ]);

      // Claim DIVA fees with treasury account and send fees to treasury account.
      await s.diva.connect(impersonatedDIVATreasurySigner).claimFee(
        wTokenAddress,
        impersonatedDIVATreasurySigner.address, // fee recipient
      );

      // Confirm that the impersonatedDIVATreasurySigner has a positive wToken balance after claiming the fees.
      const wTokenBalanceAfter = await wTokenContract.balanceOf(
        impersonatedDIVATreasurySigner.address,
      );
      expect(wTokenBalanceAfter).to.eq(wTokenBalanceBefore + claimAmount);

      // ---------
      // Act: Redeem wToken for collateralToken.
      // ---------
      await s.aaveDIVAWrapper
        .connect(impersonatedDIVATreasurySigner)
        .redeemWToken(
          wTokenAddress,
          wTokenBalanceAfter,
          impersonatedDIVATreasurySigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the collateral token balance of the impersonatedDIVATreasurySigner increased by the wToken balance after.
      // ---------
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(
          impersonatedDIVATreasurySigner.address,
        );
      expect(collateralTokenBalanceAfter).to.eq(
        collateralTokenBalanceBefore + wTokenBalanceAfter,
      );
    });

    it("Should return the `_amountReturned` variable", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly.
      // ---------
      // Determine the amount to remove by taking the minimum of the user's long and short token balance.
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      // ---------
      // Act: Redeem wToken.
      // ---------
      const returnedAmount = await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemWToken.staticCall(
          wTokenAddress,
          wTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the returned amount is correct.
      // ---------
      expect(returnedAmount).to.eq(wTokenBalance);
    });

    it("Should redeem the user's entire wToken balance if `type(uint256).max` is submitted", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly.
      // ---------
      // Determine the amount to remove by taking the minimum of the user's long and short token balance.
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      // Get collateral token balance before redemption
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Redeem wTokens using type(uint256).max
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemWToken(
          wTokenAddress,
          ethers.MaxUint256,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the user's wToken balance is now 0 and the collateral token balance increased by the wToken amount.
      // ---------
      // Verify wToken balance is now 0
      const wTokenBalanceAfter = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalanceAfter).to.equal(0);

      // Verify collateral token balance increased by wToken amount
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(
        collateralTokenBalanceAfter - collateralTokenBalanceBefore,
      ).to.equal(wTokenBalance);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `ERC20InsufficientBalance` error when attempting to redeem more wTokens than user's balance", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly.
      // ---------
      // Determine the amount to remove by taking the minimum of the user's long and short token balance.
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      const wTokenAmountToRedeem = wTokenBalance + BigInt(1);

      // ---------
      // Act & Assert: Attempt to redeem more wTokens than the user has. Should throw in the ERC20's burn function.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .redeemWToken(
            wTokenAddress,
            wTokenAmountToRedeem,
            s.impersonatedSigner.address,
            false,
          ),
      )
        .to.be.revertedWithCustomError(
          wTokenContract,
          "ERC20InsufficientBalance",
        )
        .withArgs(
          s.impersonatedSigner.address,
          wTokenBalance,
          wTokenAmountToRedeem,
        );
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit `WTokenRedeemed` event when redeeming wTokens including the collateral token as the `assetReturned`", async () => {
      // ---------
      // Arrange: Create pool and get wToken balance
      // ---------
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );

      // ---------
      // Act & Assert: Redeem wTokens and verify event emission
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .redeemWToken(
            wTokenAddress,
            wTokenBalance,
            s.impersonatedSigner.address,
            false,
          ),
      )
        .to.emit(s.aaveDIVAWrapper, "WTokenRedeemed")
        .withArgs(
          wTokenAddress,
          wTokenBalance,
          collateralToken,
          wTokenBalance,
          collateralToken,
          s.impersonatedSigner.address,
        );
    });

    it("Should revert with `ZeroAddress` error if recipient is the zero address", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly.
      // ---------
      // Determine the amount to remove by taking the minimum of the user's long and short token balance.
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      // ---------
      // Act & Assert: Attempt to redeem wToken with zero address recipient.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .redeemWToken(wTokenAddress, wTokenBalance, ethers.ZeroAddress, false),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });
  });

  describe.only("redeemWToken with outputAToken = true", async () => {
    let s: SetupOutput;
    let wTokenAddress: string;
    let wTokenContract: WToken;
    let aTokenAddress: string;
    let aTokenContract: ERC20;
    let poolId: string;
    let poolParams: IDIVA.PoolStructOutput;
    let r: RemoveLiquidityParams;
    let longTokenContract: ERC20;
    let shortTokenContract: ERC20;

    beforeEach(async () => {
      ({
        s,
        wTokenContract,
        wTokenAddress,
        aTokenContract,
        aTokenAddress,
        longTokenContract,
        shortTokenContract,
        poolId,
        poolParams,
        r,
      } = await setupWithPool());
    });

    it("Should allow DIVA treasury to claim protocol fees in wToken and redeem them for aTokens", async () => {
      // ---------
      // Arrange: Simulate DIVA fee claim resulting in the DIVA treasury having to claim the wToken directly from the DIVA
      // Protocol contract and convert it into aToken via the `redeemWToken` function.
      // ---------
      // Impersonate the DIVA Protocol treasury account, the account that is eligible to claim the fees inside DIVA Protocol.
      const divaTreasuryInfo = await s.diva.getTreasuryInfo();
      const treasuryAddress = divaTreasuryInfo.treasury;
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [treasuryAddress],
      });
      const impersonatedDIVATreasurySigner =
        await ethers.getSigner(treasuryAddress);

      // Get the initial wToken, collateral token and aToken balances of the impersonatedDIVATreasurySigner.
      const wTokenBalanceBefore = await wTokenContract.balanceOf(
        impersonatedDIVATreasurySigner.address,
      );
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(
          impersonatedDIVATreasurySigner.address,
        );
      const aTokenBalanceBefore = await aTokenContract.balanceOf(
        impersonatedDIVATreasurySigner.address,
      );

      // Remove liquidity which allocates fees to the treasury account, claimable post pool expiry.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(r.poolId, r.positionTokenAmount, r.recipient, true);

      // Fast forward in time past pool expiration and report outcome with data provider.
      // It's not relevant which value is reported here. Also, to simplify the test case, the
      // challenge functionality has been disabled, so that the value submission is immediately considered final/confirmed.
      const nextBlockTimestamp = Number(poolParams.expiryTime) + 1;
      await mine(nextBlockTimestamp);
      await s.diva
        .connect(s.dataProvider)
        .setFinalReferenceValue(poolId, "1", false);

      // Get updated pool parameters and confirm that the pool was confirmed (equivalent to statusFinalReferenceValue = 3).
      const poolParamsAfter = await s.diva.getPoolParameters(poolId);
      expect(poolParamsAfter.statusFinalReferenceValue).to.eq(3);

      // Confirm that the DIVA treasury has a positive claim amount in wToken.
      const claimAmount = await s.diva.getClaim(
        wTokenAddress,
        impersonatedDIVATreasurySigner.address,
      );
      expect(claimAmount).to.gt(0);

      // Fund the impersonatedDIVATreasurySigner with the native gas token to pay for gas.
      await hre.network.provider.send("hardhat_setBalance", [
        treasuryAddress,
        toBeHex(parseUnits("10", 18)), // Sending 10 native tokens
      ]);

      // Claim DIVA fees with treasury account and send fees to treasury account.
      await s.diva.connect(impersonatedDIVATreasurySigner).claimFee(
        wTokenAddress,
        impersonatedDIVATreasurySigner.address, // fee recipient
      );

      // Confirm that the impersonatedDIVATreasurySigner has a positive wToken balance after claiming the fees.
      const wTokenBalanceAfter = await wTokenContract.balanceOf(
        impersonatedDIVATreasurySigner.address,
      );
      expect(wTokenBalanceAfter).to.eq(wTokenBalanceBefore + claimAmount);

      // ---------
      // Act: Redeem wToken for aToken.
      // ---------
      await s.aaveDIVAWrapper
        .connect(impersonatedDIVATreasurySigner)
        .redeemWToken(
          wTokenAddress,
          wTokenBalanceAfter,
          impersonatedDIVATreasurySigner.address,
          true,
        );

      // ---------
      // Assert: Confirm that the aToken balance of the impersonatedDIVATreasurySigner increased by the wToken balance after 
      // and the collateral token balance remained unchanged.
      // ---------
      // Verify aToken balance increased by wToken amount
      const aTokenBalanceAfter =
        await aTokenContract.balanceOf(
          impersonatedDIVATreasurySigner.address,
        );
      expect(aTokenBalanceAfter).to.be.closeTo(
        aTokenBalanceBefore + wTokenBalanceAfter,
        1, // closeTo to account for yield that might have accrued since last block
      );

      // Verify collateral token balance remained unchanged
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(
          impersonatedDIVATreasurySigner.address,
        );
      expect(collateralTokenBalanceAfter).to.eq(collateralTokenBalanceBefore);
    });

    it("Should reduce the AaveDIVAWrapper contract's aToken balance by the wToken amount", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly and get initial balances.
      // ---------
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);
    
      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);
    
      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);
    
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);
    
      // Get the aToken balance of AaveDIVAWrapper contract before redeeming wTokens.
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperBefore).to.be.gt(0);
    
      // Get collateral token balance before (should be 0, but verify for completeness).
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceBefore).to.eq(0);
    
      // ---------
      // Act: Redeem wTokens with outputAToken = true.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemWToken(
          wTokenAddress,
          wTokenBalance,
          s.impersonatedSigner.address,
          true,
        );
    
      // ---------
      // Assert: Confirm that the aToken balance of AaveDIVAWrapper contract decreased by the wToken amount
      // and collateral token balance remains at zero.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.be.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore - wTokenBalance,
        1, // closeTo to account for yield that might have accrued since last block
      );
    
      // Verify collateral token balance remains at zero.
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAfter).to.eq(0);
    });

    it("Should redeem the user's entire wToken balance if `type(uint256).max` is submitted", async () => {
      // ---------
      // Arrange: Obtain wToken by removing liquidity from DIVA Protocol directly.
      // ---------
      // Determine the amount to remove by taking the minimum of the user's long and short token balance.
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance + shortTokenBalance).to.gt(0);

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      // Get aToken and collateral token balances before redemption
      const aTokenBalanceBefore = await aTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      
      // ---------
      // Act: Redeem wTokens using type(uint256).max
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemWToken(
          wTokenAddress,
          ethers.MaxUint256,
          s.impersonatedSigner.address,
          true,
        );

      // ---------
      // Assert: Confirm that the user's wToken balance is now 0 and the aToken balance increased by the wToken amount 
      // and the collateral token balance remained unchanged.
      // ---------
      // Verify wToken balance is now 0
      const wTokenBalanceAfter = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalanceAfter).to.equal(0);

      // Verify aToken balance increased by wToken amount
      const aTokenBalanceAfter = await aTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(aTokenBalanceAfter).to.be.closeTo(
        aTokenBalanceBefore + wTokenBalance, 1, // closeTo to account for yield that might have accrued since last block
      );

      // Verify collateral token balance remained unchanged
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(
        collateralTokenBalanceAfter,
      ).to.equal(collateralTokenBalanceBefore);
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit `WTokenRedeemed` event when redeeming wTokens including the aToken as the `assetReturned`", async () => {
      // ---------
      // Arrange: Create pool and get wToken balance
      // ---------
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );

      const posBalanceToRedeem =
        longTokenBalance < shortTokenBalance
          ? longTokenBalance
          : shortTokenBalance;
      expect(posBalanceToRedeem).to.gt(0);

      // Remove liquidity from DIVA Protocol directly to obtain wToken
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, posBalanceToRedeem);

      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );

      // ---------
      // Act & Assert: Redeem wTokens and verify event emission
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .redeemWToken(
            wTokenAddress,
            wTokenBalance,
            s.impersonatedSigner.address,
            true,
          ),
      )
        .to.emit(s.aaveDIVAWrapper, "WTokenRedeemed")
        .withArgs(
          wTokenAddress,
          wTokenBalance,
          collateralToken,
          wTokenBalance,
          aTokenAddress,
          s.impersonatedSigner.address,
        );
    });
  });

  describe("claimYield", async () => {
    let s: SetupOutput;
    let aTokenContract: ERC20;
    let poolId: string;
    let poolParams: IDIVA.PoolStructOutput;
    let shortTokenContract: ERC20;
    let longTokenContract: ERC20;

    beforeEach(async () => {
      ({
        s,
        aTokenContract,
        poolId,
        poolParams,
        shortTokenContract,
        longTokenContract,
      } = await setupWithPool());
    });

    it("Should allow the owner to claim the accrued yield", async () => {
      // ---------
      // Arrange: Get collateral token balance and simulate yield accrual.
      // ---------
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);

      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // Get accrued yield before claiming.
      const accruedYieldBefore =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYieldBefore).to.be.gt(10); // 10 is an arbitrary number to ensure that some minimum yield accrued; could have used 1 instead.

      // ---------
      // Act: Claim yield.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // ---------
      // Assert: Confirm that the owner's collateral token balance increased by the accrued yield.
      // ---------
      // Confirm that the accrued yield was reset to zero.
      const accruedYieldAfter =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYieldAfter).to.be.lte(1); // Not using eq(0) here because there may have been some yield accrued after the claim.

      // Confirm that the owner's collateral token balance increased by the accrued yield.
      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      expect(collateralTokenBalanceOwnerAfter).to.be.closeTo(
        collateralTokenBalanceOwnerBefore + accruedYieldBefore,
        1, // closeTo to account for yield that might have accrued since last block
      );
    });

    it("Should reduce the AaveDIVAWrapper contract's aToken balance by the claimed yield amount", async () => {
      // ---------
      // Arrange: Simulate yield accrual and get aToken balance of AaveDIVAWrapper contract.
      // ---------
      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // Get the aToken balance of the AaveDIVAWrapper contract before claiming.
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );

      // Get accrued yield.
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);

      // ---------
      // Act: Claim yield.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // ---------
      // Assert: Confirm that the aToken balance of the AaveDIVAWrapper contract decreased by the accrued yield.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore - accruedYield,
        1,
      ); // closeTo to account for yield that might have accrued since last block
    });

    it("Should not affect the owner's aToken balance when claiming yield", async () => {
      // This test is to make sure that the collateral token is returned and not the aToken.

      // ---------
      // Arrange: Get owner's aToken balance and simulate yield accrual.
      // ---------
      const aTokenBalanceOwnerBefore = await aTokenContract.balanceOf(
        s.owner.address,
      );

      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // ---------
      // Act: Claim yield.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // ---------
      // Assert: Confirm that the aToken balance of the owner remains unchanged.
      // ---------
      const aTokenBalanceOwnerAfter = await aTokenContract.balanceOf(
        s.owner.address,
      );
      expect(aTokenBalanceOwnerAfter).to.be.eq(aTokenBalanceOwnerBefore);
    });

    it("Should allow owner to claim and send accrued yield to a non-owner recipient address", async () => {
      // ---------
      // Arrange: Get collateral token balance of non-owner account and simulate yield accrual.
      // ---------
      const nonOwnerAccount = s.acc2;
      const collateralTokenBalanceNonOwnerBefore =
        await s.collateralTokenContract.balanceOf(nonOwnerAccount.address);

      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // Get accrued yield before claiming.
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield).to.be.gt(0);

      // ---------
      // Act: Claim yield.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, nonOwnerAccount.address);

      // ---------
      // Assert: Confirm that the non-owner's collateral token balance increased by the accrued yield.
      // ---------
      const collateralTokenBalanceNonOwnerAfter =
        await s.collateralTokenContract.balanceOf(nonOwnerAccount.address);
      expect(collateralTokenBalanceNonOwnerAfter).to.be.gte(
        collateralTokenBalanceNonOwnerBefore + accruedYield,
      ); // Using >= instead of > here as there could be already accrued yield in the next block after the claim.
    });

    it("Should allow owner to claim accrued yield multiple times and receive correct total amount", async () => {
      // ---------
      // Arrange: Get owner's collateral token balance, simulate yield accrual, claim once and then simulate yield again for second claim.
      // ---------
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);

      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // Get accrued yield before first claim.
      const accruedYield1 =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield1).to.be.gt(10); // 10 is an arbitrary number to ensure that some minimum yield accrued; could have used 1 instead.

      // Claim yield first time.
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // Mine several blocks to simulate yield accrual.
      await mine(20000);

      // Get accrued yield before second claim.
      const accruedYield2 =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield2).to.be.gt(10); // 10 is an arbitrary number to ensure that some minimum yield accrued; could have used 1 instead.

      // ---------
      // Act: Claim yield second time.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // ---------
      // Assert: Confirm that yield was reset to zero and confirm the owner's collateral token balance increased by the accrued yield.
      // ---------
      expect(
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken),
      ).to.be.lte(1); // Using <= 1 instead of = 0 because there may have been some yield accrued after the second claim.

      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      expect(collateralTokenBalanceOwnerAfter).to.be.closeTo(
        collateralTokenBalanceOwnerBefore + accruedYield1 + accruedYield2,
        1,
      ); // closeTo to account for yield that might have accrued since last block
    });

    it("Should return the `_amountReturned` variable", async () => {
      // ---------
      // Arrange: Mine several blocks to simulate yield accrual.
      // ---------
      await mine(10000);

      // Confirm that some yield has accrued.
      const accruedYieldBefore =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYieldBefore).to.be.gt(10);

      // ---------
      // Act: Get expected return amount using staticCall.
      // ---------
      const amountReturned = await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield.staticCall(collateralToken, s.owner.address);

      // ---------
      // Assert: Verify that staticCall returns a non-zero amount.
      // ---------
      expect(amountReturned).to.be.gt(0);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert with `CollateralTokenNotRegistered` error when attempting to claim yield for an unregistered collateral token", async () => {
      // ---------
      // Arrange: Mine several blocks to simulate yield accrual.
      // ---------
      await mine(10000);

      // ---------
      // Assert & Act: Attempt to claim yield for an unregistered collateral token.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .claimYield(s.dummyTokenContract.target, s.owner.address),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });

    it("Should revert with Aave error code 26 when attempting to claim yield when no yield has accrued", async () => {
      // ---------
      // Arrange: Remove liquidity and claim all yield to ensure no yield is remaining.
      // ---------
      // Approve position tokens for AaveDIVAWrapper contract.
      await shortTokenContract
        .connect(s.impersonatedSigner)
        .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);
      await longTokenContract
        .connect(s.impersonatedSigner)
        .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);

      // Confirm that the impersonated signer owns all position tokens.
      const amountToRemove = poolParams.collateralBalance;
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(shortTokenBalance).to.be.eq(amountToRemove);
      expect(longTokenBalance).to.be.eq(amountToRemove);

      // Fast forward in time to ensure that some yield is generated. Otherwise claimYield will revert
      // with error string '26' (invalid amount) inside Aave's withdraw function due to zero accrued yield.
      await mine(1000);

      // Remove all liquidity to ensure no yield can accrue.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, amountToRemove, s.owner.address, false);
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.owner.address);

      // Claim yield to render accrued yield zero.
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      expect(accruedYield).to.be.eq(0);

      // ---------
      // Assert & Act: Confirm that the claim transaction fails with Aave's error code 26 (invalid amount)
      // For details, see here: https://github.com/aave-dao/aave-v3-origin/blob/main/src/contracts/protocol/libraries/helpers/Errors.sol#L35
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .claimYield(collateralToken, s.owner.address),
      ).to.be.revertedWith("26");
    });

    it("Should revert if called by non-owner account", async () => {
      // ---------
      // Arrange: Mine several blocks to simulate non-zero yield (otherwise Aave's function which is called inside claimYield will fail with error code 26, invalid amount).
      // ---------
      const nonOwnerAccount = s.acc2;
      await mine(10000);

      // ---------
      // Assert & Act: Attempt to claim yield with non-owner account.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(nonOwnerAccount)
          .claimYield(collateralToken, nonOwnerAccount.address),
      )
        .to.be.revertedWithCustomError(
          s.aaveDIVAWrapper,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(nonOwnerAccount.address);
    });

    it("Should revert with 'ZeroAddress' error when attempting to claim yield with zero address recipient", async () => {
      // ---------
      // Arrange: Set recipient to zero address and mine several blocks to simulate non-zero yield to avoid failure due to zero amount (see test above).
      // ---------
      const invalidRecipient = ethers.ZeroAddress;
      await mine(10000);

      // ---------
      // Assert & Act: Attempt to claim yield with zero recipient should fail inside the ERC20 collateral token.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .claimYield(collateralToken, invalidRecipient),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });

    // -------------------------------------------
    // Events
    // -------------------------------------------

    it("Should emit an `YieldClaimed` event when owner claims the yield", async () => {
      // ---------
      // Arrange: Mine several blocks to simulate non-zero yield (otherwise Aave's function which is called inside claimYield will fail with error code 26, invalid amount).
      // ---------
      await mine(10000);
      const accruedYield =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);

      // ------
      // Act: Claim yield.
      // ------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .claimYield(collateralToken, s.acc2.address);

      // ---------
      // Assert: Confirm that an `YieldClaimed` event is emitted.
      // ---------
      // In ethers v6, events are handled differently than in v5. See here: https://ethereum.stackexchange.com/questions/152626/ethers-6-transaction-receipt-events-information
      const filter = s.aaveDIVAWrapper.filters.YieldClaimed;
      const events = await s.aaveDIVAWrapper.queryFilter(filter);
      const emitRes = events[0].args;

      expect(emitRes[0]).to.eq(s.owner.address); // claimer
      expect(emitRes[1]).to.eq(s.acc2.address); // recipient
      expect(emitRes[2]).to.eq(collateralToken); // collateral token address
      expect(emitRes[3]).to.closeTo(accruedYield, 1); // accrued yield amount

      // Note: Not using below way to test the event because I need the closeTo matcher for the accruedYield.
      //   await expect(
      //     s.aaveDIVAWrapper
      //       .connect(s.owner)
      //       .claimYield(collateralToken, s.owner.address),
      //   )
      //     .to.emit(s.aaveDIVAWrapper, "YieldClaimed")
      //     .withArgs(
      //       s.owner.address,
      //       s.owner.address,
      //       collateralToken,
      //       accruedYield,
      //     );
    });
  });

  describe("approveCollateralTokenForAave", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);
    });

    it("Should reset the allowance of a registered collateral token for Aave V3 to maximum value after it has been partially depleted", async () => {
      // ---------
      // Arrange: Register the collateral token (which sets the allowance to max uint256) and create a contingent pool to reduce the allowance.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );

      // Confirm that the allowance is max uint256 after registering the collateral token.
      const collateralTokenAllowanceAfterRegister =
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        );
      expect(collateralTokenAllowanceAfterRegister).to.eq(ethers.MaxUint256);

      // Create a contingent pool to reduce the allowance.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // Confirm that the allowance is less than max uint256 after creating the pool.
      const collateralTokenAllowanceBefore =
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        );
      expect(collateralTokenAllowanceBefore).to.be.lt(ethers.MaxUint256);

      // ---------
      // Act: Reset the allowance to max uint256.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .approveCollateralTokenForAave(collateralToken);

      // ---------
      // Assert: Confirm that the allowance was reset to max uint256.
      // ---------
      const collateralTokenAllowanceAfter =
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        );
      expect(collateralTokenAllowanceAfter).to.equal(ethers.MaxUint256);
    });

    // Below test doesn't work because the mockUSDT contract is not supported by Aave V3.
    // it("Should handle Ethereum USDT's special approve behavior when resetting allowance", async () => {
    //   // ---------
    //   // Arrange: First, deploy mock USDT that mimics Ethereum USDT's approval behavior, which requires setting allowance
    //   // to 0 before changing it to a new non-zero value. Then register it as collateral token in AaveDIVAWrapper, which
    //   // will set an unlimited allowance for Aave.
    //   // ---------
    //   // Deploy mock USDT
    //   const MockUSDT = await ethers.getContractFactory("MockUSDT");
    //   const mockUSDT = await MockUSDT.deploy();
    //   await mockUSDT.waitForDeployment();

    //   // Confirm that the mock USDT contract reverts when trying to set non-zero approval twice (using the same
    //   // amount both times without loss of generality).
    //   await mockUSDT.connect(s.owner).approve(s.impersonatedSigner.address, 1000);
    //   await expect(
    //     mockUSDT.connect(s.owner).approve(s.impersonatedSigner.address, 1000)
    //   ).to.be.revertedWith("USDT: current allowance must be 0");

    //   // Register mock USDT as collateral token
    //   await s.aaveDIVAWrapper
    //     .connect(s.owner)
    //     .registerCollateralToken(mockUSDT.target);

    //   // Confirm that the allowance is max uint256 after the registration
    //   const mockUSDTAllowanceAfterRegister =
    //     await mockUSDT.allowance(
    //       s.aaveDIVAWrapper.target,
    //       poolAddress,
    //     );
    //   expect(mockUSDTAllowanceAfterRegister).to.eq(ethers.MaxUint256);

    //   // Mint some mock USDT to impersonatedSigner in order to create a contingent pool.
    //   const mintAmount = parseUnits("1000", 6); // 1000 USDT
    //   await mockUSDT.mint(s.impersonatedSigner.address, mintAmount);

    //   // Set the collateral token to mock USDT
    //   s.createContingentPoolParams.collateralToken = mockUSDT.target;
    //   s.createContingentPoolParams.collateralAmount = parseUnits("10", 6);

    //   // Approve the AaveDIVAWrapper contract to spend the mock USDT
    //   await mockUSDT
    //     .connect(s.impersonatedSigner)
    //     .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);

    //   // Create a contingent pool to reduce the allowance.
    //   await s.aaveDIVAWrapper
    //     .connect(s.impersonatedSigner)
    //     .createContingentPool(s.createContingentPoolParams);

    //   // Confirm that the allowance is less than max uint256 after creating the pool.
    //   const mockUSDTAllowanceBefore =
    //     await mockUSDT.allowance(
    //       s.aaveDIVAWrapper.target,
    //       poolAddress,
    //     );
    //   expect(mockUSDTAllowanceBefore).to.be.lt(ethers.MaxUint256);

    //   // ---------
    //   // Act: Reset the allowance to max uint256.
    //   // ---------
    //   await s.aaveDIVAWrapper
    //     .connect(s.impersonatedSigner)
    //     .approveCollateralTokenForAave(mockUSDT.target);

    //   // ---------
    //   // Assert: Confirm that the allowance was reset to max uint256.
    //   // ---------
    //   const finalAllowance = await mockUSDT.allowance(
    //     s.impersonatedSigner.address,
    //     s.aaveDIVAWrapper.target
    //   );
    //   expect(finalAllowance).to.equal(ethers.MaxUint256);
    // });

    it("Should allow any account to reset the Aave allowance for a registered collateral token", async () => {
      // ---------
      // Arrange: Register the collateral token and create a contingent pool to reduce the allowance.
      // ---------
      const nonOwner = s.acc2;
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );

      // Confirm that the allowance is max uint256 after registering the collateral token.
      const collateralTokenAllowanceAfterRegister =
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        );
      expect(collateralTokenAllowanceAfterRegister).to.eq(ethers.MaxUint256);

      // Create a contingent pool to reduce the allowance.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // Confirm that the allowance is less than max uint256 after creating the pool.
      const collateralTokenAllowanceBefore =
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        );
      expect(collateralTokenAllowanceBefore).to.be.lt(ethers.MaxUint256);

      // ---------
      // Act: Non-owner attempts to reset the allowance.
      // ---------
      await s.aaveDIVAWrapper
        .connect(nonOwner)
        .approveCollateralTokenForAave(collateralToken);

      // ---------
      // Assert: Check that the allowance was reset to max uint256.
      // ---------
      const collateralTokenAllowance = await collateralTokenContract.allowance(
        s.aaveDIVAWrapper.target,
        poolAddress,
      );
      expect(collateralTokenAllowance).to.equal(ethers.MaxUint256);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if trying to approve an unregistered collateral token", async () => {
      // ---------
      // Arrange: Use an unregistered collateral token address.
      // ---------
      const unregisteredCollateralToken =
        "0x000000000000000000000000000000000000dead";

      // ---------
      // Act & Assert: Expect to revert with the error 'CollateralTokenNotRegistered'.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.owner)
          .approveCollateralTokenForAave(unregisteredCollateralToken),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });
  });

  describe("redeemPositionToken with outputAToken = false", async () => {
    let s: SetupOutput;
    let wTokenContract: WToken;
    let aTokenContract: ERC20;
    let shortTokenContract: ERC20;
    let longTokenContract: ERC20;
    let poolParams: IDIVA.PoolStructOutput;
    let collateralTokenBalance: bigint;
    let longTokenBalance: bigint;
    let shortTokenBalance: bigint;
    let wTokenSupply: bigint;
    let expectedLongTokenPayout: bigint;
    let expectedShortTokenPayout: bigint;

    beforeEach(async () => {
      ({
        s,
        poolParams,
        longTokenContract,
        shortTokenContract,
        longTokenBalance,
        shortTokenBalance,
        collateralTokenBalance,
        wTokenSupply,
        wTokenContract,
        aTokenContract,
        expectedLongTokenPayout,
        expectedShortTokenPayout,
      } = await setupWithConfirmedPool());
    });

    it("Should reduce the long token balance of the redeeming user", async () => {
      // ---------
      // Arrange: `longTokenBalance` of impersonatedSigner is retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(longTokenBalance).to.be.gt(0);

      // ---------
      // Act: Redeem long position token for collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the user's long token balance reduced to zero.
      // ---------
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner,
      );
      expect(longTokenBalanceAfter).to.eq(0);
    });

    it("Should reduce the short token balance of the redeeming user", async () => {
      // ---------
      // Arrange: `shortTokenBalance` of impersonatedSigner is retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(shortTokenBalance).to.be.gt(0);

      // ---------
      // Act: Redeem short position token for collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the user's long token balances reduces to zero.
      // ---------
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner,
      );
      expect(shortTokenBalanceAfter).to.eq(0);
    });

    it("Should increase the user's collateral token balance", async () => {
      // ---------
      // Arrange: Expected long and short token payouts are calculated inside the `setupWithConfirmedPool` function.
      // ---------
      expect(expectedLongTokenPayout).to.be.gt(0);
      expect(expectedShortTokenPayout).to.be.gt(0);

      // ---------
      // Act 1: Redeem long position token for collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert 1: Confirm that the collateralToken balance of the impersonatedSigner increased by the expected long token payout.
      // ---------
      const collateralTokenBalanceAfterLongRedemption =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfterLongRedemption).to.eq(
        collateralTokenBalance + expectedLongTokenPayout,
      );

      // ---------
      // Act 2: Redeem short position token for collateral token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert 2: Confirm that the collateralToken balance of the impersonatedSigner increased by the expected short token payout.
      // ---------
      const collateralTokenBalanceAfterShortRedemption =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfterShortRedemption).to.eq(
        collateralTokenBalanceAfterLongRedemption + expectedShortTokenPayout,
      );
    });

    it("Should reduce the wToken supply after redeeming long tokens", async () => {
      // ---------
      // Arrange: `wTokenSupply` of wTokenContract is retrieved inside `setupWithConfirmedPool`.
      // ---------

      // ---------
      // Act: Redeem long position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Verify that wToken supply decreased by the redeemed long token amount (net of DIVA fees).
      // Note: The remaining wToken supply represents DIVA fees and will be burnt when the DIVA owner
      // claims and redeems them via redeemWToken().
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(wTokenSupply - expectedLongTokenPayout);
    });

    it("Should reduce the wToken supply after redeeming short tokens", async () => {
      // ---------
      // Arrange: `wTokenSupply` of wTokenContract is retrieved inside `setupWithConfirmedPool`.
      // ---------

      // ---------
      // Act: Redeem short position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Verify that wToken supply decreased by the redeemed short token amount (net of DIVA fees).
      // Note: The remaining wToken supply represents DIVA fees and will be burnt when the DIVA owner
      // claims and redeems them via redeemWToken().
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(
        BigInt(wTokenSupply) - BigInt(expectedShortTokenPayout),
      );
    });

    it("The AaveDIVAWrapper contract's wToken balance should be zero before and after redeeming long tokens", async () => {
      // ---------
      // Arrange: Confirm that the wToken balance of the AaveDIVAWrapper contract before redeeming long tokens is zero.
      // ---------
      const wTokenBalanceAaveDIVAWrapperBefore = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Redeem long position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's wToken balance remains zero after redeeming long tokens.
      // ---------
      const wTokenBalanceAaveDIVAWrapperAfter = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's wToken balance should be zero before and after redeeming short tokens", async () => {
      // ---------
      // Arrange: Confirm that the wToken balance of the AaveDIVAWrapper contract before redeeming short tokens is zero.
      // ---------
      const wTokenBalanceAaveDIVAWrapperBefore = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Redeem short position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's wToken balance remains zero after redeeming short tokens.
      // ---------
      const wTokenBalanceAaveDIVAWrapperAfter = await wTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(wTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's collateralToken balance should be zero before and after redeeming long tokens", async () => {
      // ---------
      // Arrange: Confirm that the collateralToken balance of the AaveDIVAWrapper contract before redeeming long tokens is zero.
      // ---------
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );
      const collateralTokenBalanceAaveDIVAWrapperBefore =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Redeem long position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's collateralToken balance remains zero after redeeming long tokens.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperAfter =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("The AaveDIVAWrapper contract's collateralToken balance should be zero before and after redeeming short tokens", async () => {
      // ---------
      // Arrange: Confirm that the collateralToken balance of the AaveDIVAWrapper contract before redeeming short tokens is zero.
      // ---------
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );
      const collateralTokenBalanceAaveDIVAWrapperBefore =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperBefore).to.eq(0);

      // ---------
      // Act: Redeem short position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that AaveDIVAWrapper contract's collateralToken balance remains zero after redeeming short tokens.
      // ---------
      const collateralTokenBalanceAaveDIVAWrapperAfter =
        await collateralTokenContract.balanceOf(s.aaveDIVAWrapper.target);
      expect(collateralTokenBalanceAaveDIVAWrapperAfter).to.eq(0);
    });

    it("Should reduce the AaveDIVAWrapper contract's aToken balance after redeeming long tokens", async () => {
      // ---------
      // Arrange: Get the aToken balance of AaveDIVAWrapper contract before redeeming long tokens.
      // ---------
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperBefore).to.be.gt(0);

      // ---------
      // Act: Redeem long position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the aToken balance of AaveDIVAWrapper contract reduced by the payout received by the user.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore - expectedLongTokenPayout,
        2,
      ); // closeTo to account for yield that might have accrued since last block
    });

    it("Should reduce the AaveDIVAWrapper contract's aToken balance after redeeming short tokens", async () => {
      // ---------
      // Arrange: Get the aToken balance of AaveDIVAWrapper contract before redeeming short tokens.
      // ---------
      const aTokenBalanceAaveDIVAWrapperBefore = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperBefore).to.be.gt(0);

      // ---------
      // Act: Redeem short position token.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the aToken balance of AaveDIVAWrapper contract reduced by the payout received by the user.
      // ---------
      const aTokenBalanceAaveDIVAWrapperAfter = await aTokenContract.balanceOf(
        s.aaveDIVAWrapper.target,
      );
      expect(aTokenBalanceAaveDIVAWrapperAfter).to.closeTo(
        aTokenBalanceAaveDIVAWrapperBefore - expectedShortTokenPayout,
        2,
      ); // closeTo to account for yield that might have accrued since last block
    });

    it("Should correctly update token balances when redeeming both long and short position tokens", async () => {
      // ---------
      // Arrange: `longTokenBalance`, `shortTokenBalance`, `collateralTokenBalance` and `wTokenSupply` of impersonatedSigner
      // are retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(longTokenBalance).to.be.gt(0);
      expect(shortTokenBalance).to.be.gt(0);
      expect(expectedLongTokenPayout).to.be.gt(0);
      expect(expectedShortTokenPayout).to.be.gt(0);

      // ---------
      // Act: Redeem long and short position tokens .
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          longTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          shortTokenBalance,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert 1: Confirm that the user's long and short token balances reduced to zero.
      // ---------
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner,
      );
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner,
      );
      expect(longTokenBalanceAfter).to.eq(0);
      expect(shortTokenBalanceAfter).to.eq(0);

      // ---------
      // Assert 2: Confirm that the user's collateral token balance increased by the expected long and short token payouts.
      // ---------
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(collateralTokenBalanceAfter).to.eq(
        collateralTokenBalance +
          expectedLongTokenPayout +
          expectedShortTokenPayout,
      );

      // ---------
      // Assert 3: Confirm that the wToken supply reduced by the redeemed amount.
      // ---------
      const wTokenSupplyAfter = await wTokenContract.totalSupply();
      expect(wTokenSupplyAfter).to.eq(
        wTokenSupply - expectedLongTokenPayout - expectedShortTokenPayout,
      );
    });

    it("Should redeem the user's entire long token balance if `type(uint256).max` is submitted", async () => {
      // ---------
      // Arrange: `longTokenBalance` and `expectedLongTokenPayout` of impersonatedSigner are retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(longTokenBalance).to.be.gt(0);
      expect(expectedLongTokenPayout).to.be.gt(0);

      // Get collateral token balance before redemption
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Redeem position tokens using type(uint256).max.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.longToken,
          ethers.MaxUint256,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the user's position token balance is now 0 and the collateral token balance increased by the expected payout.
      // ---------
      // Verify position token balance is now 0
      const longTokenBalanceAfter = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalanceAfter).to.equal(0);

      // Verify collateral token balance increased by expected payout
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(
        collateralTokenBalanceAfter - collateralTokenBalanceBefore,
      ).to.equal(expectedLongTokenPayout);
    });

    it("Should redeem the user's entire short token balance if `type(uint256).max` is submitted", async () => {
      // ---------
      // Arrange: `shortTokenBalance` and `expectedShortTokenPayout` of impersonatedSigner are retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(shortTokenBalance).to.be.gt(0);
      expect(expectedShortTokenPayout).to.be.gt(0);

      // Get collateral token balance before redemption
      const collateralTokenBalanceBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // ---------
      // Act: Redeem position tokens using type(uint256).max.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken(
          poolParams.shortToken,
          ethers.MaxUint256,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the user's position token balance is now 0 and the collateral token balance increased by the expected payout.
      // ---------
      // Verify position token balance is now 0
      const shortTokenBalanceAfter = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(shortTokenBalanceAfter).to.equal(0);

      // Verify collateral token balance increased by expected payout
      const collateralTokenBalanceAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);
      expect(
        collateralTokenBalanceAfter - collateralTokenBalanceBefore,
      ).to.equal(expectedShortTokenPayout);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should return the `_amountReturned` variable", async () => {
      // ---------
      // Arrange: Define the position token and amount to redeem (should be positive).
      // ---------
      expect(longTokenBalance + shortTokenBalance).to.gt(0);
      let posTokenToRedeem: string;
      let posBalanceToRedeem: bigint;
      if (longTokenBalance > 0) {
        posTokenToRedeem = poolParams.longToken;
        posBalanceToRedeem = longTokenBalance;
      } else {
        posTokenToRedeem = poolParams.shortToken;
        posBalanceToRedeem = shortTokenBalance;
      }

      // ---------
      // Act: Redeem the position token.
      // ---------
      const returnedAmount = await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .redeemPositionToken.staticCall(
          posTokenToRedeem,
          posBalanceToRedeem,
          s.impersonatedSigner.address,
          false,
        );

      // ---------
      // Assert: Confirm that the returned amount is correct.
      // ---------
      if (longTokenBalance > 0) {
        expect(returnedAmount).to.eq(expectedLongTokenPayout);
      } else {
        expect(returnedAmount).to.eq(expectedShortTokenPayout);
      }
    });

    it("Should revert with `CollateralTokenNotRegistered` error if redeeming with an invalid position token", async () => {
      // ---------
      // Arrange: Create a pool on DIVA Protocol with an invalid collateral token.
      // ---------
      // Confirm that the token to be used as collateral for creating the pool in DIVA is not a wToken and hence has not associated collateral token
      // stored in AaveDIVAWrapper.
      const collateralTokenFromWToken =
        await s.aaveDIVAWrapper.getCollateralToken(
          s.createContingentPoolParams.collateralToken,
        );
      expect(collateralTokenFromWToken).to.eq(ethers.ZeroAddress);

      // Update the expiry time to be 1 hour in the future in case the latest block timestamp is greater than the expiryTime
      // defined in `createContingentPoolParams`.
      const lastBlockTimestamp = await getLastTimestamp();
      s.createContingentPoolParams.expiryTime = (
        lastBlockTimestamp + 3600
      ).toString();

      // Create a new contingent pool via DIVA Protocol directly.
      await s.diva
        .connect(s.impersonatedSigner)
        .createContingentPool(s.createContingentPoolParams);

      // Get pool parameters for the newly created pool.
      const poolId = await getPoolIdFromDIVAEvent(s.diva);
      const poolParams = await s.diva.getPoolParameters(poolId);

      // ---------
      // Act & Assert: Attempt to redeem with an invalid position token.
      // ---------
      await expect(
        s.aaveDIVAWrapper.redeemPositionToken(
          poolParams.shortToken,
          1,
          s.impersonatedSigner.address,
          false,
        ),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "CollateralTokenNotRegistered",
      );
    });

    it("Should revert with `ZeroAddress` error if recipient is the zero address", async () => {
      // ---------
      // Arrange: `longTokenBalance` of impersonatedSigner is retrieved inside `setupWithConfirmedPool`.
      // ---------
      expect(longTokenBalance).to.be.gt(0);

      // ---------
      // Act & Assert: Attempt to redeem position token with zero address recipient.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(s.impersonatedSigner)
          .redeemPositionToken(
            poolParams.longToken,
            longTokenBalance,
            ethers.ZeroAddress,
            false,
          ),
      ).to.be.revertedWithCustomError(s.aaveDIVAWrapper, "ZeroAddress");
    });
  });

  describe("batchRegisterCollateralToken", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);
    });

    it("Should register two new collateral tokens", async () => {
      // ---------
      // Arrange: Confirm that the collateral tokens are not registered yet.
      // ---------
      const wTokenAddress1Before =
        await s.aaveDIVAWrapper.getWToken(collateralToken);
      const wTokenAddress2Before =
        await s.aaveDIVAWrapper.getWToken(collateralToken2);
      expect(wTokenAddress1Before).to.eq(ethers.ZeroAddress);
      expect(wTokenAddress2Before).to.eq(ethers.ZeroAddress);

      // ---------
      // Act: Register both collateral tokens.
      // ---------
      const tx = await s.aaveDIVAWrapper
        .connect(s.owner)
        .batchRegisterCollateralToken([collateralToken, collateralToken2]);

      // Wait for transaction to be mined and get return value
      const receipt = await tx.wait();
      const wTokenAddresses = receipt.logs
        .filter((log) => {
          try {
            const parsedLog = s.aaveDIVAWrapper.interface.parseLog(log);
            return parsedLog?.name === "CollateralTokenRegistered";
          } catch {
            return false;
          }
        })
        .map((log) => {
          const parsedLog = s.aaveDIVAWrapper.interface.parseLog(log);
          return parsedLog?.args[1]; // wToken address is the second argument
        });

      // ---------
      // Assert: Verify that both tokens were registered correctly.
      // ---------
      // Verify wToken addresses are non-zero and match the returned addresses
      const wTokenAddress1After =
        await s.aaveDIVAWrapper.getWToken(collateralToken);
      const wTokenAddress2After =
        await s.aaveDIVAWrapper.getWToken(collateralToken2);
      expect(wTokenAddress1After).to.not.eq(ethers.ZeroAddress);
      expect(wTokenAddress2After).to.not.eq(ethers.ZeroAddress);
      expect(wTokenAddress1After).to.eq(wTokenAddresses[0]);
      expect(wTokenAddress2After).to.eq(wTokenAddresses[1]);

      // Verify reverse mapping works
      expect(
        await s.aaveDIVAWrapper.getCollateralToken(wTokenAddress1After),
      ).to.eq(collateralToken);
      expect(
        await s.aaveDIVAWrapper.getCollateralToken(wTokenAddress2After),
      ).to.eq(collateralToken2);

      // Connect to wToken contracts and verify they're properly initialized
      const wToken1Contract = await ethers.getContractAt(
        "WToken",
        wTokenAddress1After,
      );
      const wToken2Contract = await ethers.getContractAt(
        "WToken",
        wTokenAddress2After,
      );

      // Get collateral token contracts
      const collateralTokenContract = await ethers.getContractAt(
        "IERC20",
        collateralToken,
      );
      const collateralToken2Contract = await ethers.getContractAt(
        "IERC20",
        collateralToken2,
      );

      // Verify wToken owner
      expect(await wToken1Contract.owner()).to.eq(s.aaveDIVAWrapper.target);
      expect(await wToken2Contract.owner()).to.eq(s.aaveDIVAWrapper.target);

      // Verify approvals are set
      expect(
        await wToken1Contract.allowance(s.aaveDIVAWrapper.target, divaAddress),
      ).to.eq(ethers.MaxUint256);
      expect(
        await wToken2Contract.allowance(s.aaveDIVAWrapper.target, divaAddress),
      ).to.eq(ethers.MaxUint256);
      expect(
        await collateralTokenContract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        ),
      ).to.eq(ethers.MaxUint256);
      expect(
        await collateralToken2Contract.allowance(
          s.aaveDIVAWrapper.target,
          poolAddress,
        ),
      ).to.eq(ethers.MaxUint256);
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if not called by owner", async () => {
      // ---------
      // Arrange: Get non-owner signer and collateral tokens to register.
      // ---------
      const nonOwner = s.impersonatedSigner;
      expect(await s.aaveDIVAWrapper.owner()).to.not.eq(nonOwner.address);

      const collateralTokens = [collateralToken, collateralToken2];

      // ---------
      // Act & Assert: Verify that transaction reverts when called by non-owner.
      // ---------
      await expect(
        s.aaveDIVAWrapper
          .connect(nonOwner)
          .batchRegisterCollateralToken(collateralTokens),
      ).to.be.revertedWithCustomError(
        s.aaveDIVAWrapper,
        "OwnableUnauthorizedAccount",
      );
    });
  });

  describe("batchCreateContingentPool", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      // Fetch the setup fixture.
      s = await loadFixture(setup);

      // Register collateral token.
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken);
    });

    it("Should correctly allocate long and short tokens to the specified recipients", async () => {
      // ---------
      // Arrange: Set up pool parameters and approve collateral token spending.
      // ---------
      // Update the expiry time to be 1 hour in the future.
      const lastBlockTimestamp = await getLastTimestamp();
      const poolParams1 = { ...s.createContingentPoolParams };
      const poolParams2 = { ...s.createContingentPoolParams };
      poolParams1.expiryTime = (lastBlockTimestamp + 3600).toString();
      poolParams2.expiryTime = (lastBlockTimestamp + 3600).toString();

      // Get the wToken address.
      const wTokenAddress = await s.aaveDIVAWrapper.getWToken(collateralToken);

      // Approve collateral token spending.
      await s.collateralTokenContract
        .connect(s.impersonatedSigner)
        .approve(wTokenAddress, ethers.MaxUint256);

      // ---------
      // Act: Create two contingent pools via AaveDIVAWrapper.
      // ---------
      // Get filter for PoolIssued events
      const filter = s.aaveDIVAWrapper.filters.PoolIssued();

      // Create pools
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .batchCreateContingentPool([poolParams1, poolParams2]);

      // Get events and extract poolIds
      const events = await s.aaveDIVAWrapper.queryFilter(filter, -1);
      const poolIds = events.map((event) => event.args[0]);

      // Get pool parameters for both pools.
      const poolParams = await Promise.all(
        poolIds.map((poolId) => s.diva.getPoolParameters(poolId)),
      );

      // ---------
      // Assert: Confirm that the long and short tokens were allocated correctly.
      // ---------
      for (const params of poolParams) {
        // Get token contracts.
        const longTokenContract = await ethers.getContractAt(
          "IERC20",
          params.longToken,
        );
        const shortTokenContract = await ethers.getContractAt(
          "IERC20",
          params.shortToken,
        );

        // Check token balances.
        expect(
          await longTokenContract.balanceOf(s.impersonatedSigner.address),
        ).to.eq(params.collateralBalance);
        expect(
          await shortTokenContract.balanceOf(s.impersonatedSigner.address),
        ).to.eq(params.collateralBalance);
      }
    });
  });

  describe("batchAddLiquidity", () => {
    it("Should correctly allocate long and short tokens to the specified recipients", async () => {
      // ---------
      // Arrange: Load fixture and prepare the arguments for adding liquidity in a batch. Adding
      // liquidity to the same pool with two different recipient combinations for simplicity.
      // ---------
      const { s, poolId, shortTokenContract, longTokenContract } =
        await setupWithPool();

      // Get long and short token balances of impersonatedSigner and owner.
      const longTokenBalanceImpersonatedSignerBefore =
        await longTokenContract.balanceOf(s.impersonatedSigner.address);
      const shortTokenBalanceImpersonatedSignerBefore =
        await shortTokenContract.balanceOf(s.impersonatedSigner.address);
      const longTokenBalanceOwnerBefore = await longTokenContract.balanceOf(
        s.owner.address,
      );

      const collateralAmountToAdd1 = parseUnits(
        "30",
        s.collateralTokenDecimals,
      );
      const collateralAmountToAdd2 = parseUnits(
        "70",
        s.collateralTokenDecimals,
      );

      const addLiquidityArgs = [
        {
          poolId: poolId,
          collateralAmount: collateralAmountToAdd1,
          longRecipient: s.impersonatedSigner.address,
          shortRecipient: s.impersonatedSigner.address,
        },
        {
          poolId: poolId,
          collateralAmount: collateralAmountToAdd2,
          longRecipient: s.owner.address,
          shortRecipient: s.impersonatedSigner.address,
        },
      ];

      // ---------
      // Act: Add liquidity in batch with two different recipient combinations.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .batchAddLiquidity(addLiquidityArgs);

      // ---------
      // Assert: Check token balances after adding liquidity
      // ---------
      // Get long and short token balances of impersonatedSigner and owner.
      const longTokenBalanceImpersonatedSignerAfter =
        await longTokenContract.balanceOf(s.impersonatedSigner.address);
      const shortTokenBalanceImpersonatedSignerAfter =
        await shortTokenContract.balanceOf(s.impersonatedSigner.address);
      const longTokenBalanceOwnerAfter = await longTokenContract.balanceOf(
        s.owner.address,
      );

      // Confirm that the token balances are correct.
      expect(longTokenBalanceImpersonatedSignerAfter).to.eq(
        longTokenBalanceImpersonatedSignerBefore + collateralAmountToAdd1,
      );
      expect(shortTokenBalanceImpersonatedSignerAfter).to.eq(
        shortTokenBalanceImpersonatedSignerBefore +
          collateralAmountToAdd1 +
          collateralAmountToAdd2,
      );
      expect(longTokenBalanceOwnerAfter).to.eq(
        longTokenBalanceOwnerBefore + collateralAmountToAdd2,
      );
    });
  });

  describe("batchRemoveLiquidity with outputAToken = false", () => {
    it("Should correctly remove liquidity and transfer collateral tokens to recipients", async () => {
      // ---------
      // Arrange: Load fixture and prepare the arguments for removing liquidity in a batch.
      // ---------
      const { s, poolId, poolParams, shortTokenContract, longTokenContract } =
        await setupWithPool();

      // Get initial balances.
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Prepare amounts to remove.
      const amountToRemove1 = parseUnits("30", s.collateralTokenDecimals);
      const amountToRemove2 = parseUnits("70", s.collateralTokenDecimals);

      const removeLiquidityArgs = [
        {
          poolId: poolId,
          positionTokenAmount: amountToRemove1,
          recipient: s.owner.address,
          outputAToken: false,
        },
        {
          poolId: poolId,
          positionTokenAmount: amountToRemove2,
          recipient: s.impersonatedSigner.address,
          outputAToken: false,
        },
      ];

      // ---------
      // Act: Remove liquidity in batch.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .batchRemoveLiquidity(removeLiquidityArgs);

      // ---------
      // Assert: Check balances after removing liquidity.
      // ---------
      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Calculate expected amounts (accounting for DIVA fee).
      const fee1 = await calcTotalDIVAFee(
        s.diva,
        poolParams,
        amountToRemove1,
        s.collateralTokenDecimals,
      );
      const expectedAmount1 = amountToRemove1 - fee1;
      const fee2 = await calcTotalDIVAFee(
        s.diva,
        poolParams,
        amountToRemove2,
        s.collateralTokenDecimals,
      );
      const expectedAmount2 = amountToRemove2 - fee2;

      // Verify balances increased by expected amounts.
      expect(collateralTokenBalanceOwnerAfter).to.eq(
        collateralTokenBalanceOwnerBefore + expectedAmount1,
      );
      expect(collateralTokenBalanceImpersonatedSignerAfter).to.eq(
        collateralTokenBalanceImpersonatedSignerBefore + expectedAmount2,
      );

      // Verify position token balances decreased.
      expect(
        await longTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(poolParams.collateralBalance - amountToRemove1 - amountToRemove2);
      expect(
        await shortTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(poolParams.collateralBalance - amountToRemove1 - amountToRemove2);
    });
  });

  describe("batchRedeemPositionToken with outputAToken = false", () => {
    it("Should correctly redeem position tokens and transfer collateral tokens to recipients", async () => {
      // ---------
      // Arrange: Load fixture and prepare the arguments for redeeming position tokens in a batch.
      // ---------
      const { s, poolParams, shortTokenContract, longTokenContract } =
        await setupWithConfirmedPool();

      // Get initial balances of payout recipients.
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Prepare position token amounts to redeem.
      const positionTokenAmountToRedeem1 = parseUnits(
        "20",
        s.collateralTokenDecimals,
      );
      const positionTokenAmountToRedeem2 = parseUnits(
        "10",
        s.collateralTokenDecimals,
      );

      // Calculate expected amounts (accounting for DIVA fee).
      const expLongTokenPayout =
        (poolParams.payoutLong * positionTokenAmountToRedeem1) /
        parseUnits("1", s.collateralTokenDecimals);

      const expShortTokenPayout =
        (poolParams.payoutShort * positionTokenAmountToRedeem2) /
        parseUnits("1", s.collateralTokenDecimals);

      // Confirm initial position token balances of redeeming user (impersonatedSigner).
      const longTokenBalance = await longTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      const shortTokenBalance = await shortTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(longTokenBalance).to.gt(positionTokenAmountToRedeem1);
      expect(shortTokenBalance).to.gt(positionTokenAmountToRedeem2);

      // Prepare redeem arguments. Impersonated signer redeems the short token to himself and the long token to the owner.
      const redeemPositionTokenArgs = [
        {
          positionToken: longTokenContract.target,
          positionTokenAmount: positionTokenAmountToRedeem1,
          recipient: s.owner.address,
          outputAToken: false,
        },
        {
          positionToken: shortTokenContract.target,
          positionTokenAmount: positionTokenAmountToRedeem2,
          recipient: s.impersonatedSigner.address,
          outputAToken: false,
        },
      ];

      // ---------
      // Act: Redeem position tokens in batch.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .batchRedeemPositionToken(redeemPositionTokenArgs);

      // ---------
      // Assert: Check balances after redeeming position tokens.
      // ---------
      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Verify collateral token balances increased by expected amounts.
      expect(collateralTokenBalanceOwnerAfter).to.eq(
        collateralTokenBalanceOwnerBefore + expLongTokenPayout,
      );
      expect(collateralTokenBalanceImpersonatedSignerAfter).to.eq(
        collateralTokenBalanceImpersonatedSignerBefore + expShortTokenPayout,
      );

      // Verify position token balances decreased correctly.
      expect(
        await longTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(longTokenBalance - positionTokenAmountToRedeem1);
      expect(
        await shortTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(shortTokenBalance - positionTokenAmountToRedeem2);
    });
  });

  describe("batchRedeemWToken with outputAToken = false", () => {
    it("Should correctly redeem wTokens and transfer collateral tokens to recipients", async () => {
      // ---------
      // Arrange: Load fixture and obtain wTokens by removing liquidity from DIVA Protocol.
      // ---------
      const { s, poolId, wTokenContract } = await setupWithPool();

      // Get initial balances.
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerBefore =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Remove liquidity from DIVA Protocol directly to obtain wToken.
      const amountToRemove = parseUnits("100", s.collateralTokenDecimals);
      await s.diva
        .connect(s.impersonatedSigner)
        .removeLiquidity(poolId, amountToRemove);

      // Confirm that the user has a positive wToken balance.
      const wTokenBalance = await wTokenContract.balanceOf(
        s.impersonatedSigner.address,
      );
      expect(wTokenBalance).to.gt(0);

      // Prepare amounts to redeem.
      const wTokenAmountToRedeem1 = parseUnits("20", s.collateralTokenDecimals);
      const wTokenAmountToRedeem2 = parseUnits("10", s.collateralTokenDecimals);

      const redeemWTokenArgs = [
        {
          wToken: wTokenContract.target,
          wTokenAmount: wTokenAmountToRedeem1,
          recipient: s.owner.address,
          outputAToken: false,
        },
        {
          wToken: wTokenContract.target,
          wTokenAmount: wTokenAmountToRedeem2,
          recipient: s.impersonatedSigner.address,
          outputAToken: false,
        },
      ];

      // ---------
      // Act: Redeem wTokens in batch.
      // ---------
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .batchRedeemWToken(redeemWTokenArgs);

      // ---------
      // Assert: Check balances after redeeming wTokens.
      // ---------
      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralTokenBalanceImpersonatedSignerAfter =
        await s.collateralTokenContract.balanceOf(s.impersonatedSigner.address);

      // Verify collateral token balances increased by redeemed amounts.
      expect(collateralTokenBalanceOwnerAfter).to.eq(
        collateralTokenBalanceOwnerBefore + wTokenAmountToRedeem1,
      );
      expect(collateralTokenBalanceImpersonatedSignerAfter).to.eq(
        collateralTokenBalanceImpersonatedSignerBefore + wTokenAmountToRedeem2,
      );

      // Verify wToken balance decreased correctly.
      expect(
        await wTokenContract.balanceOf(s.impersonatedSigner.address),
      ).to.eq(wTokenBalance - wTokenAmountToRedeem1 - wTokenAmountToRedeem2);
    });
  });

  describe("batchClaimYield", () => {
    it("Should correctly claim yield and transfer collateral tokens to recipients", async () => {
      // ---------
      // Arrange: Load fixture and create pools with different collateral tokens.
      // ---------
      const { s } = await setupWithPool(); // Creates pool with first collateral token

      // Register second collateral token.
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken2);

      // Create a second pool with the second collateral token.
      const createPoolParams2 = {
        ...s.createContingentPoolParams,
        collateralToken: collateralToken2,
        collateralAmount: parseUnits("100", s.collateralTokenDecimals),
      };

      // Approve second collateral token.
      const collateralToken2Contract = await ethers.getContractAt(
        "IERC20",
        collateralToken2,
      );
      await collateralToken2Contract
        .connect(s.impersonatedSigner)
        .approve(s.aaveDIVAWrapper.target, ethers.MaxUint256);

      // Create second pool.
      await s.aaveDIVAWrapper
        .connect(s.impersonatedSigner)
        .createContingentPool(createPoolParams2);

      // Get initial balances of yield recipient (owner).
      const collateralTokenBalanceOwnerBefore =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralToken2BalanceOwnerBefore =
        await collateralToken2Contract.balanceOf(s.owner.address);

      // Mine several blocks to simulate yield accrual.
      await mine(10000);

      // Get accrued yield before claiming.
      const accruedYield1Before =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      const accruedYield2Before =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken2);
      expect(accruedYield1Before).to.be.gt(10);
      expect(accruedYield2Before).to.be.gt(10);

      const claimYieldArgs = [
        {
          collateralToken: collateralToken,
          recipient: s.owner.address,
        },
        {
          collateralToken: collateralToken2,
          recipient: s.owner.address,
        },
      ];

      // ---------
      // Act: Claim yield in batch from both tokens.
      // ---------
      await s.aaveDIVAWrapper.connect(s.owner).batchClaimYield(claimYieldArgs);

      // ---------
      // Assert: Check balances after claiming yield.
      // ---------
      const collateralTokenBalanceOwnerAfter =
        await s.collateralTokenContract.balanceOf(s.owner.address);
      const collateralToken2BalanceOwnerAfter =
        await collateralToken2Contract.balanceOf(s.owner.address);

      // Verify collateral token balances increased by claimed amounts.
      expect(collateralTokenBalanceOwnerAfter).to.be.closeTo(
        collateralTokenBalanceOwnerBefore + accruedYield1Before,
        1, // Allow for small rounding differences
      );
      expect(collateralToken2BalanceOwnerAfter).to.be.closeTo(
        collateralToken2BalanceOwnerBefore + accruedYield2Before,
        1, // Allow for small rounding differences
      );

      // Verify accrued yield was reset to near zero for both tokens.
      const accruedYield1After =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken);
      const accruedYield2After =
        await s.aaveDIVAWrapper.getAccruedYield(collateralToken2);
      expect(accruedYield1After).to.be.lte(1);
      expect(accruedYield2After).to.be.lte(1);
    });

    it("Should revert if not called by owner", async () => {
      // ---------
      // Arrange: Load fixture, get non-owner account and prepare claim arguments.
      // ---------
      const { s } = await setupWithPool();
      const nonOwner = s.acc2;
      expect(await s.aaveDIVAWrapper.owner()).to.not.eq(nonOwner.address);

      // Not relevant what to put here as it should fail before the function is executed.
      const claimYieldArgs = [
        {
          collateralToken: collateralToken,
          recipient: nonOwner.address,
        },
        {
          collateralToken: collateralToken2,
          recipient: nonOwner.address,
        },
      ];

      // ---------
      // Act & Assert: Attempt to claim yield with non-owner account.
      // ---------
      await expect(
        s.aaveDIVAWrapper.connect(nonOwner).batchClaimYield(claimYieldArgs),
      )
        .to.be.revertedWithCustomError(
          s.aaveDIVAWrapper,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(nonOwner.address);
    });
  });

  describe("batchApproveCollateralTokenForAave", () => {
    it("Should approve collateral tokens for Aave", async () => {
      // ---------
      // Arrange: Load fixture and register two collateral tokens.
      // ---------
      const { s } = await setupWithPool(); // Registers first collateral token

      // Register second collateral token.
      await s.aaveDIVAWrapper
        .connect(s.owner)
        .registerCollateralToken(collateralToken2);

      // ---------
      // Act: Reset allowances in batch.
      // ---------
      await s.aaveDIVAWrapper.batchApproveCollateralTokenForAave([
        collateralToken,
        collateralToken2,
      ]);

      // ---------
      // Assert: No assertions needed as test is considered successful if it doesn't revert.
      // ---------
    });
  });

  describe("Ownership Transfer", async () => {
    let s: SetupOutput;

    beforeEach(async () => {
      s = await loadFixture(setup);
    });

    it("Should follow the two-step transfer process correctly", async () => {
      // ---------
      // Arrange: Prepare ownership transfer.
      // ---------
      const initialOwner = s.owner;
      const newOwner = s.acc2;

      // Confirm initial owner is set correctly.
      const initialDetails = await s.aaveDIVAWrapper.getContractDetails();
      expect(initialDetails[2]).to.equal(initialOwner.address);

      // Initiate ownership transfer with current owner.
      await s.aaveDIVAWrapper
        .connect(initialOwner)
        .transferOwnership(newOwner.address);

      // Verify pending owner is set correctly.
      expect(await s.aaveDIVAWrapper.pendingOwner()).to.equal(newOwner.address);

      // Verify current owner hasn't changed yet.
      let currentDetails = await s.aaveDIVAWrapper.getContractDetails();
      expect(currentDetails[2]).to.equal(initialOwner.address);

      // ---------
      // Act: New owner accepts ownership.
      // ---------
      await s.aaveDIVAWrapper.connect(newOwner).acceptOwnership();

      // ---------
      // Assert: Verify ownership has been transferred.
      // ---------
      currentDetails = await s.aaveDIVAWrapper.getContractDetails();
      expect(currentDetails[2]).to.equal(newOwner.address);

      // Verify pending owner has been reset.
      expect(await s.aaveDIVAWrapper.pendingOwner()).to.equal(
        ethers.ZeroAddress,
      );
    });

    // -------------------------------------------
    // Reverts
    // -------------------------------------------

    it("Should revert if non-owner tries to transfer ownership", async () => {
      // ---------
      // Arrange: Get non-owner account.
      // ---------
      const nonOwner = s.acc2;
      const newOwner = s.acc3;

      // ---------
      // Act & Assert: Attempt to transfer ownership from non-owner account.
      // ---------
      await expect(
        s.aaveDIVAWrapper.connect(nonOwner).transferOwnership(newOwner.address),
      )
        .to.be.revertedWithCustomError(
          s.aaveDIVAWrapper,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(nonOwner.address);
    });

    it("Should revert if non-pending owner tries to accept ownership", async () => {
      // ---------
      // Arrange: Set up pending ownership transfer.
      // ---------
      const initialOwner = s.owner;
      const intendedNewOwner = s.acc2;
      const nonPendingOwner = s.acc3;

      // Initial owner starts transfer process.
      await s.aaveDIVAWrapper
        .connect(initialOwner)
        .transferOwnership(intendedNewOwner.address);

      // ---------
      // Act & Assert: Attempt to accept ownership from non-pending owner account.
      // ---------
      await expect(s.aaveDIVAWrapper.connect(nonPendingOwner).acceptOwnership())
        .to.be.revertedWithCustomError(
          s.aaveDIVAWrapper,
          "OwnableUnauthorizedAccount",
        )
        .withArgs(nonPendingOwner.address);
    });
  });
});
