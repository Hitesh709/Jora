import test from "node:test";
import assert from "node:assert/strict";
import {ChampionSelector} from "../src/core/champion-selector.js";
test("selects qualifying first champion",()=>assert.equal(new ChampionSelector().select({candidate:{evaluation:{score:.9}}}).selected,true));
test("blocks candidate below champion",()=>assert.equal(new ChampionSelector().select({candidate:{evaluation:{score:.85}},champion:{evaluation:{score:.9}}}).selected,false));
