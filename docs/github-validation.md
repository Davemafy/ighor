# Provider validation

Tests execute separately in the public `Davemafy/qloo-test` repository:

| Run                                                                                            | Actual result                                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [Offline provider regressions](https://github.com/Davemafy/qloo-test/actions/runs/40167634005) | 12 script contracts and 8 response-summary tests passed.                                                                                   |
| [Fresh place discovery](https://github.com/Davemafy/qloo-test/actions/runs/40167409602)        | Four Qloo requests completed; zero model calls. This does not validate user relevance.                                                     |
| [Fresh Gemini corrections](https://github.com/Davemafy/qloo-test/actions/runs/40167409632)     | Three cases passed; one failed because access confirmation was omitted from the practical-facts action. Four model calls; zero Qloo calls. |

Its Actions artifact is `12588019503`, with SHA-256 `dd30d523340216105d768fb6530344270c02a4f59cd59e6dee7734e7e231caf0`. Missing availability must remain unknown; a successful model response does not establish a complete correction.

Only standalone harness workflows were added or retriggered in qloo-test. No current private application source, runtime database or credential was copied there. The full private application's tests were previously executed locally; these Actions runs are provider-contract tests, not an exact-runtime Next.js integration.
