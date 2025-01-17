import { Signer, ethers } from "ethers";
import dotenv from "dotenv";
import { erc20Abi } from "viem";
import uniswapAbi from "./uniswapAbi.json";

dotenv.config();

if (!process.env.PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is not defined in the environment variables");
}
if (!process.env.ROUTER_V2_ADDRESS) {
  throw new Error("ROUTER_V2_ADDRESS is not defined in the environment variables");
}
if (!process.env.USDT_ADDRESS) {
  throw new Error("USDT_ADDRESS is not defined in the environment variables");
}

// ALREADY SET IN FRONT-END
const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_PROVIDER);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);


const routerContract = new ethers.Contract(process.env.ROUTER_V2_ADDRESS, uniswapAbi, signer);

// Tokens database
const OtherTokenAddress = "0xec5dcb5dbf4b114c9d0f65bccab49ec54f6a0867"; // DAI

async function main() {
  await convertOtherTokenToUSDTAndTransferToPlatformAddress(0.01, 1);
  // await getOtherTokenAmountForExactUSDT(1, 1, OtherTokenAddress)
  // await depositToken(0.01)
}

// USE FOR OTHER TOKEN PAYMENTS
async function convertOtherTokenToUSDTAndTransferToPlatformAddress(
  USDTRequired: any, slippageTolerance: any
) {
  console.log("USDTRequired===>", USDTRequired);

  const tokenContract = new ethers.Contract(
    OtherTokenAddress,
    erc20Abi,
    signer
  );

  // Get decimals for USDT and OtherToken
  const usdtDecimals = await getTokenDecimals(process.env.USDT_ADDRESS);
  const otherTokenDecimals = await getTokenDecimals(OtherTokenAddress);
  console.log("usdtDecimals===>", usdtDecimals);
  console.log("otherTokenDecimals===>", otherTokenDecimals);

  // Calculate the exact amount of USDT required
  const amountOutExactUSDT = ethers.utils.parseUnits(USDTRequired.toString(), usdtDecimals);
  console.log("amountOutExactUSDT===>", ethers.utils.formatUnits(amountOutExactUSDT, usdtDecimals));

  // Get the amount of OtherToken needed for the exact amount of USDT required
  const amountsIn = await routerContract.getAmountsIn(
    amountOutExactUSDT,
    [OtherTokenAddress, process.env.USDT_ADDRESS]
  );

  const amountInOtherToken = amountsIn[0];
  console.log("amountInOtherToken===>", ethers.utils.formatUnits(amountInOtherToken, otherTokenDecimals));

  const slippage = 1 + slippageTolerance / 100;
  const amountInMaxWithSlippage = amountInOtherToken.mul(ethers.BigNumber.from(Math.floor(slippage * 100))).div(ethers.BigNumber.from(100));
  console.log("amountInMaxWithSlippage===>", ethers.utils.formatUnits(amountInMaxWithSlippage, otherTokenDecimals));

  const otherTokenAllowance = await checkAllowance(OtherTokenAddress);
  console.log("otherTokenAllowance===>", ethers.utils.formatUnits(otherTokenAllowance, otherTokenDecimals));

  if (otherTokenAllowance.lt(amountInMaxWithSlippage)) {
    console.log("ALLOWANCE LOW, TRANSACTION TO APPROVE TOKEN SPEND");
    try {
      const approveTx = await tokenContract.approve(
        process.env.ROUTER_V2_ADDRESS,
        amountInOtherToken
      );

      const approveReceipt = await approveTx.wait();

      // Check if the transaction was successful
      if (approveReceipt.status === 1) {
        const newOtherTokenAllowance = await checkAllowance(OtherTokenAddress);
        console.log("newOtherTokenAllowance===>", ethers.utils.formatUnits(newOtherTokenAllowance, otherTokenDecimals));
      } else {
        console.log("Approve transaction failed");
        return;
      }
    } catch (err) {
      console.log("Approve Failed", err);
      return;
    }
  } else {
    console.log("ALLOWANCE MATCHED, CONTINUE");
  }

  try {
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
 
    console.log("SWAP TRANSACTION");

    const swapTx = await routerContract.swapTokensForExactTokens(
      amountOutExactUSDT,
      amountInMaxWithSlippage,
      [OtherTokenAddress, process.env.USDT_ADDRESS],
      process.env.PLATFORM_ADDRESS,
      deadline,
      {
        gasLimit: 1000000,
      }
    );
    
    // const swapResultData = {
    //   //userID
    //   //packID
    //   senderWalletAddress: signer.address, // user's wallet address
    //   targetWalletAddress: process.env.PLATFORM_ADDRESS,
    //   txnHash: swapTx.hash,
    //   swapToken: OtherTokenAddress,
    //   amountIn: ethers.utils.formatUnits(amountInOtherToken, otherTokenDecimals),
    //   amountOut: ethers.utils.formatUnits(amountOutExactUSDT, usdtDecimals),
    // };
    // // POST API CREATE TRANSACTION (/transaction) WITH ABOVE DATA

    const swapReceipt = await swapTx.wait();
    
    // Check if the transaction was successful
    if (swapReceipt.status === 1) {
      console.log("Swap successful")
    } else {
      console.log("Swap transaction failed");
      return;
    }
  } catch (err) {
    console.log("Swap Error", err);
  }
}

// USE FOR USDT DIRECT PAYMENTS
async function depositToken(amount: number) {
  
  try {
    if (!process.env.USDT_ADDRESS) {
      throw new Error("USDT_ADDRESS is not defined in the environment variables");
    }
    const usdtTokenContract = new ethers.Contract(process.env.USDT_ADDRESS, erc20Abi, signer);
    const decimals = await usdtTokenContract.decimals();
    
    const depositTx = await usdtTokenContract.transfer(
      process.env.PLATFORM_ADDRESS,
      ethers.utils.parseUnits(amount.toString(), Number(decimals))
    );

    // const depositResultData = {
    //   //userID
    //   //packID
    //   senderWalletAddress: signer.address, // user's wallet address
    //   targetWalletAddress: process.env.PLATFORM_ADDRESS,
    //   txnHash: depositTx.hash,
    //   swapToken: process.env.USDT_ADDRESS,
    //   amountIn: amount.toString(),
    //   amountOut: amount.toString(),
    // };
    // // POST API CREATE TRANSACTION (/transaction) WITH ABOVE DATA

    const depositReceipt = await depositTx.wait();
    
    // Check if the transaction was successful
    if (depositReceipt.status === 1) {
      console.log("Deposit successful")
    } else {
      console.log("Deposit transaction failed");
      return;
    }
  } catch (err) {
    console.log("Deposit Error", err);
  }
  
}

// HELPER FUNCTIONS

// Get swap token buy amount for exact USDT
async function getOtherTokenAmountForExactUSDT(exactUSDTAmount: any, slippageTolerance: any, OtherTokenAddress: any) {
  try {
    if (!process.env.ROUTER_V2_ADDRESS) {
      throw new Error("ROUTER_V2_ADDRESS is not defined in the environment variables");
    }
    const routerContract = new ethers.Contract(process.env.ROUTER_V2_ADDRESS, uniswapAbi, signer);
    const usdtDecimals = await getTokenDecimals(process.env.USDT_ADDRESS);
    const otherTokenDecimals = await getTokenDecimals(OtherTokenAddress);

    // console.log("usdtDecimals===>", usdtDecimals);
    // console.log("otherTokenDecimals===>", otherTokenDecimals);

    const amountOutExactUSDT = ethers.utils.parseUnits(exactUSDTAmount.toString(), usdtDecimals);
    // console.log("amountOutExactUSDT===>", amountOutExactUSDT.toString());

    const amountsIn = await routerContract.getAmountsIn(
      amountOutExactUSDT,
      [OtherTokenAddress, process.env.USDT_ADDRESS]
    );

    const amountInOtherToken = amountsIn[0];
    console.log("amountInOtherToken===>", ethers.utils.formatUnits(amountInOtherToken, otherTokenDecimals));

    const slippage = 1 + slippageTolerance / 100;
    const amountInMaxWithSlippage = amountInOtherToken.mul(ethers.BigNumber.from(Math.floor(slippage * 100))).div(ethers.BigNumber.from(100));
    console.log("amountInMaxWithSlippage===>", ethers.utils.formatUnits(amountInMaxWithSlippage, otherTokenDecimals));

    return ethers.utils.formatUnits(amountInMaxWithSlippage, otherTokenDecimals);
  } catch (error) {
    console.error("Error in getOtherTokenAmountForExactUSDT:", error);
  }
}

// Check token allowance
async function checkAllowance(token: string) {
  const tokenContract = new ethers.Contract(token, erc20Abi, signer);

  const allowance = await tokenContract.allowance(
    signer.address, // user's wallet address
    process.env.ROUTER_V2_ADDRESS
  );

  return allowance;
}

// Get token decimals
async function getTokenDecimals(tokenAddress: any) {
  const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const decimals = await tokenContract.decimals();
  return decimals;
}

main();
