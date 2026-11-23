// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {QDayRadar} from "../src/QDayRadar.sol";

contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(pk);
        QDayRadar radar = new QDayRadar();
        radar.setAttester(vm.addr(pk), true);
        vm.stopBroadcast();
        console.log("QDayRadar:", address(radar));
    }
}
