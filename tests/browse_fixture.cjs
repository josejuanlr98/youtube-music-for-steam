// Older component suites isolate navigation; real restoration is exercised in
// test_browse_return.cjs and the browser route/remount regression fixture.
exports.savedBrowseState=()=>undefined;
exports.useBrowseReturn=()=>({returning:false,capture:()=>undefined});
exports.requestBrowseReturn=()=>{};
