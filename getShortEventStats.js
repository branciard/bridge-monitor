require('dotenv').config()
const Web3 = require('web3')
const logger = require('./logger')('getShortEventStats.js')
const { getBridgeABIs, BRIDGE_MODES } = require('./utils/bridgeMode')

const { HOME_RPC_URL, FOREIGN_RPC_URL, HOME_BRIDGE_ADDRESS, FOREIGN_BRIDGE_ADDRESS } = process.env
const HOME_DEPLOYMENT_BLOCK = Number(process.env.HOME_DEPLOYMENT_BLOCK) || 0
const FOREIGN_DEPLOYMENT_BLOCK = Number(process.env.FOREIGN_DEPLOYMENT_BLOCK) || 0

const homeProvider = new Web3.providers.HttpProvider(HOME_RPC_URL)
const web3Home = new Web3(homeProvider)

const foreignProvider = new Web3.providers.HttpProvider(FOREIGN_RPC_URL)
const web3Foreign = new Web3(foreignProvider)

const ERC20_ABI = require('./abis/ERC20.abi')

async function main(bridgeMode) {
  try {
    const { HOME_ABI, FOREIGN_ABI } = getBridgeABIs(bridgeMode)
    const homeBridge = new web3Home.eth.Contract(HOME_ABI, HOME_BRIDGE_ADDRESS)
    const foreignBridge = new web3Foreign.eth.Contract(FOREIGN_ABI, FOREIGN_BRIDGE_ADDRESS)
    const erc20MethodName = bridgeMode === BRIDGE_MODES.NATIVE_TO_ERC ? 'erc677token' : 'erc20token'
    const erc20Address = await foreignBridge.methods[erc20MethodName]().call()
    const erc20Contract = new web3Foreign.eth.Contract(ERC20_ABI, erc20Address)
    logger.debug("calling homeBridge.getPastEvents('UserRequestForSignature')")
    const homeDeposits = await homeBridge.getPastEvents('UserRequestForSignature', {
      fromBlock: HOME_DEPLOYMENT_BLOCK
    })
    logger.debug("calling foreignBridge.getPastEvents('RelayedMessage')")
    const foreignDeposits = await foreignBridge.getPastEvents('RelayedMessage', {
      fromBlock: FOREIGN_DEPLOYMENT_BLOCK
    })
    logger.debug("calling homeBridge.getPastEvents('AffirmationCompleted')")
    const homeWithdrawals = await homeBridge.getPastEvents('AffirmationCompleted', {
      fromBlock: HOME_DEPLOYMENT_BLOCK
    })
    logger.debug("calling foreignBridge.getPastEvents('UserRequestForAffirmation')")
    const foreignWithdrawals =
      bridgeMode === BRIDGE_MODES.ERC_TO_ERC || bridgeMode === BRIDGE_MODES.ERC_TO_NATIVE
        ? await erc20Contract.getPastEvents('Transfer', {
            fromBlock: FOREIGN_DEPLOYMENT_BLOCK,
            filter: { to: FOREIGN_BRIDGE_ADDRESS }
          })
        : await foreignBridge.getPastEvents('UserRequestForAffirmation', {
            fromBlock: FOREIGN_DEPLOYMENT_BLOCK
          })
    logger.debug('Done')
    return {
      depositsDiff: homeDeposits.length - foreignDeposits.length,
      withdrawalDiff: homeWithdrawals.length - foreignWithdrawals.length,
      home: {
        deposits: homeDeposits.length,
        withdrawals: homeWithdrawals.length
      },
      foreign: {
        deposits: foreignDeposits.length,
        withdrawals: foreignWithdrawals.length
      }
    }
  } catch (e) {
    logger.error(e)
    throw e
  }
}
module.exports = main
