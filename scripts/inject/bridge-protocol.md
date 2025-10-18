页面端 provider -> window.__bridge.request(method, payload)  
Playwright 在 test 里用 page.exposeFunction('__bridge_request', handler) 接住，  
handler 在 Node 里用 ethers 真签/发，再把结果回传给页面端 provider。
