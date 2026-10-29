import { afterEach, expect, it, vi } from "vitest";
import { freshTask } from "../../src/data/fixtures";
import { newestWorkspace, pendingTurn, rememberTurn, recoverTurnJournal } from "../../src/components/workspace-api";
afterEach(()=>vi.unstubAllGlobals());
it("reads every persisted page without repeating a POST or paid operation",async()=>{
  const task=freshTask("task","owner");
  const transport=vi.fn().mockResolvedValueOnce(Response.json({task,status:"completed",hasMore:true,lastSequence:5,events:[{sequence:3,event:{type:"action",message:"Saved progress"}},{sequence:4,event:{type:"action",message:"More progress"}}]})).mockResolvedValueOnce(Response.json({task,status:"completed",hasMore:false,lastSequence:5,events:[{sequence:5,event:{type:"done",task}}]}));
  vi.stubGlobal("fetch",transport);
  const pages=[];

  for await(const page of recoverTurnJournal("task",{turnId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",after:2})) {pages.push(page);}

  expect(pages).toHaveLength(2);
  expect(transport.mock.calls[0][0]).toContain("after=2");expect(transport.mock.calls[1][0]).toContain("after=4");
  expect(transport.mock.calls.every(([,options])=>!options.method)).toBe(true);
});
it("persists identity/cursor only and tolerates unavailable browser storage",()=>{
  const memory=new Map<string,string>();
  vi.stubGlobal("localStorage",{getItem:(key:string)=>memory.get(key),setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)});
  const pending={turnId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",after:7};rememberTurn("task",pending);expect(pendingTurn("task")).toEqual(pending);
  rememberTurn("task",null);expect(pendingTurn("task")).toBeNull();
  vi.stubGlobal("localStorage",{getItem:()=>{throw Error("blocked");},setItem:()=>{throw Error("blocked");}});
  expect(pendingTurn("task")).toBeNull();expect(()=>rememberTurn("task",pending)).not.toThrow();
});
it("does not visually overwrite a newer correction with a late snapshot",()=>{
  const current=freshTask("task","owner");current.brief.version=8;current.brief.goal="Keep my latest correction";
  const stale=structuredClone(current);stale.brief.version=3;stale.brief.goal="Older instruction";
  expect(newestWorkspace(current,stale)).toBe(current);
});
