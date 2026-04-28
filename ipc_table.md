| Channel | Direction | Handler file:line | Type | Notes |
|---|---|---|---|---|
| `app:asset-cleanup` | DM→Main | src/main/ipc/app-handlers.ts:759 | handle | preload dm:invoke | no sender check |
| `app:choose-folder` | DM→Main | src/main/ipc/app-handlers.ts:152 | handle | preload dm:invoke | sender-aware |
| `app:close-player-window` | DM→Main | src/main/ipc/app-handlers.ts:138 | handle | preload dm:invoke | preload player:invoke | no sender check |
| `app:confirm-dialog` | DM→Main | src/main/ipc/dialog-handlers.ts:88 | handle | preload dm:invoke | sender-aware |
| `app:delete-map-confirm` | DM→Main | src/main/ipc/dialog-handlers.ts:106 | handle | preload dm:invoke | sender-aware |
| `app:delete-portrait` | DM→Main | src/main/ipc/app-handlers.ts:734 | handle | preload dm:invoke | no sender check |
| `app:delete-token-confirm` | DM→Main | src/main/ipc/dialog-handlers.ts:124 | handle | preload dm:invoke | sender-aware |
| `app:duplicate-campaign` | DM→Main | src/main/ipc/export-import.ts:74 | handle | preload dm:invoke | no sender check |
| `app:export-campaign` | DM→Main | src/main/ipc/export-import.ts:95 | handle | preload dm:invoke | no sender check |
| `app:export-to-file` | DM→Main | src/main/ipc/app-handlers.ts:896 | handle | preload dm:invoke | no sender check |
| `app:get-default-user-data-folder` | DM→Main | src/main/ipc/app-handlers.ts:147 | handle | preload dm:invoke | no sender check |
| `app:get-image-as-base64` | DM→Main | src/main/ipc/app-handlers.ts:213 | handle | preload dm:invoke | preload player:invoke | no sender check |
| `app:get-monitors` | DM→Main | src/main/ipc/app-handlers.ts:119 | handle | preload dm:invoke | no sender check |
| `app:get-user-data-path` | DM→Main | src/main/ipc/app-handlers.ts:854 | handle | preload dm:invoke | no sender check |
| `app:import-audio-files` | DM→Main | src/main/ipc/app-handlers.ts:464 | handle | preload dm:invoke | no sender check |
| `app:import-audio-folder` | DM→Main | src/main/ipc/app-handlers.ts:483 | handle | preload dm:invoke | no sender check |
| `app:import-campaign` | DM→Main | src/main/ipc/export-import.ts:144 | handle | preload dm:invoke | no sender check |
| `app:import-file` | DM→Main | src/main/ipc/app-handlers.ts:355 | handle | preload dm:invoke | no sender check |
| `app:import-from-file` | DM→Main | src/main/ipc/app-handlers.ts:861 | handle | preload dm:invoke | no sender check |
| `app:import-pdf` | DM→Main | src/main/ipc/app-handlers.ts:562 | handle | preload dm:invoke | no sender check |
| `app:import-sfx-icon` | DM→Main | src/main/ipc/app-handlers.ts:522 | handle | preload dm:invoke | no sender check |
| `app:open-content-folder` | DM→Main | src/main/ipc/app-handlers.ts:201 | handle | preload dm:invoke | no sender check |
| `app:open-player-window` | DM→Main | src/main/ipc/app-handlers.ts:127 | handle | preload dm:invoke | no sender check |
| `app:quick-backup` | DM→Main | src/main/ipc/export-import.ts:116 | handle | preload dm:invoke | no sender check |
| `app:rescan-content-folder` | DM→Main | src/main/ipc/app-handlers.ts:262 | handle | preload dm:invoke | no sender check |
| `app:save-asset-image` | DM→Main | src/main/ipc/app-handlers.ts:603 | handle | preload dm:invoke | no sender check |
| `app:save-now` | DM→Main | src/main/ipc/app-handlers.ts:663 | handle | preload dm:invoke | no sender check |
| `app:save-portrait` | DM→Main | src/main/ipc/app-handlers.ts:682 | handle | preload dm:invoke | no sender check |
| `app:set-menu-language` | DM→Main | src/main/ipc/app-handlers.ts:113 | handle | preload dm:invoke | no sender check |
| `app:set-player-monitor` | DM→Main | src/main/ipc/app-handlers.ts:122 | handle | preload dm:invoke | no sender check |
| `app:set-user-data-folder` | DM→Main | src/main/ipc/app-handlers.ts:165 | handle | preload dm:invoke | no sender check |
| `app:show-context-menu` | DM→Main | src/main/ipc/dialog-handlers.ts:37 | handle | preload dm:invoke | no sender check |
| `assets:list-for-campaign` | DM→Main | src/main/ipc/asset-handlers.ts:29 | handle | preload dm:invoke | no sender check |
| `audio-boards:create` | DM→Main | src/main/ipc/audio-board-handlers.ts:99 | handle | preload dm:invoke | no sender check |
| `audio-boards:delete` | DM→Main | src/main/ipc/audio-board-handlers.ts:132 | handle | preload dm:invoke | no sender check |
| `audio-boards:delete-slot` | DM→Main | src/main/ipc/audio-board-handlers.ts:170 | handle | preload dm:invoke | no sender check |
| `audio-boards:list-by-campaign` | DM→Main | src/main/ipc/audio-board-handlers.ts:62 | handle | preload dm:invoke | no sender check |
| `audio-boards:rename` | DM→Main | src/main/ipc/audio-board-handlers.ts:126 | handle | preload dm:invoke | no sender check |
| `audio-boards:upsert-slot` | DM→Main | src/main/ipc/audio-board-handlers.ts:138 | handle | preload dm:invoke | no sender check |
| `campaigns:count` | DM→Main | src/main/ipc/campaign-handlers.ts:49 | handle | preload dm:invoke | no sender check |
| `campaigns:create` | DM→Main | src/main/ipc/campaign-handlers.ts:56 | handle | preload dm:invoke | no sender check |
| `campaigns:delete` | DM→Main | src/main/ipc/campaign-handlers.ts:74 | handle | preload dm:invoke | no sender check |
| `campaigns:get` | DM→Main | src/main/ipc/campaign-handlers.ts:41 | handle | preload dm:invoke | no sender check |
| `campaigns:list` | DM→Main | src/main/ipc/campaign-handlers.ts:34 | handle | preload dm:invoke | no sender check |
| `campaigns:rename` | DM→Main | src/main/ipc/campaign-handlers.ts:67 | handle | preload dm:invoke | no sender check |
| `campaigns:set-cover` | DM→Main | src/main/ipc/campaign-handlers.ts:79 | handle | preload dm:invoke | no sender check |
| `campaigns:touch-last-opened` | DM→Main | src/main/ipc/campaign-handlers.ts:92 | handle | preload dm:invoke | no sender check |
| `character-sheets:count` | DM→Main | src/main/ipc/character-sheet-handlers.ts:251 | handle | preload dm:invoke | no sender check |
| `character-sheets:create` | DM→Main | src/main/ipc/character-sheet-handlers.ts:258 | handle | preload dm:invoke | no sender check |
| `character-sheets:delete` | DM→Main | src/main/ipc/character-sheet-handlers.ts:293 | handle | preload dm:invoke | no sender check |
| `character-sheets:list-by-campaign` | DM→Main | src/main/ipc/character-sheet-handlers.ts:209 | handle | preload dm:invoke | no sender check |
| `character-sheets:list-party-by-campaigns` | DM→Main | src/main/ipc/character-sheet-handlers.ts:223 | handle | preload dm:invoke | no sender check |
| `character-sheets:update` | DM→Main | src/main/ipc/character-sheet-handlers.ts:274 | handle | preload dm:invoke | no sender check |
| `compendium:import` | DM→Main | src/main/ipc/compendium-handlers.ts:173 | handle | preload dm:invoke | sender-aware |
| `compendium:list` | DM→Main | src/main/ipc/compendium-handlers.ts:137 | handle | preload dm:invoke | no sender check |
| `compendium:open-folder` | DM→Main | src/main/ipc/compendium-handlers.ts:194 | handle | preload dm:invoke | no sender check |
| `compendium:read` | DM→Main | src/main/ipc/compendium-handlers.ts:147 | handle | preload dm:invoke | no sender check |
| `data:get-item` | DM→Main | src/main/ipc/data-handlers.ts:356 | handle | preload dm:invoke | no sender check |
| `data:get-monster` | DM→Main | src/main/ipc/data-handlers.ts:267 | handle | preload dm:invoke | no sender check |
| `data:get-monster-token` | DM→Main | src/main/ipc/data-handlers.ts:294 | handle | preload dm:invoke | preload player:invoke | no sender check |
| `data:get-spell` | DM→Main | src/main/ipc/data-handlers.ts:384 | handle | preload dm:invoke | no sender check |
| `data:list-items` | DM→Main | src/main/ipc/data-handlers.ts:336 | handle | preload dm:invoke | no sender check |
| `data:list-monsters` | DM→Main | src/main/ipc/data-handlers.ts:243 | handle | preload dm:invoke | no sender check |
| `data:list-spells` | DM→Main | src/main/ipc/data-handlers.ts:364 | handle | preload dm:invoke | no sender check |
| `data:set-monster-default` | DM→Main | src/main/ipc/data-handlers.ts:300 | handle | preload dm:invoke | no sender check |
| `dm:player-window-closed` | Main→DM | src/main/windows.ts:174 | send | preload dm:on |
| `dm:player-window-size` | Main→DM | src/main/ipc/player-bridge.ts:199 | send | preload dm:on |
| `dm:request-full-sync` | Main→DM | src/main/ipc/player-bridge.ts:91 | send | preload dm:on |
| `drawings:create` | DM→Main | src/main/ipc/drawing-handlers.ts:146 | handle | preload dm:invoke | no sender check |
| `drawings:create-many` | DM→Main | src/main/ipc/drawing-handlers.ts:151 | handle | preload dm:invoke | no sender check |
| `drawings:delete` | DM→Main | src/main/ipc/drawing-handlers.ts:166 | handle | preload dm:invoke | no sender check |
| `drawings:delete-by-map` | DM→Main | src/main/ipc/drawing-handlers.ts:171 | handle | preload dm:invoke | no sender check |
| `drawings:list-by-map` | DM→Main | src/main/ipc/drawing-handlers.ts:130 | handle | preload dm:invoke | no sender check |
| `drawings:list-synced-by-map` | DM→Main | src/main/ipc/drawing-handlers.ts:138 | handle | preload dm:invoke | no sender check |
| `encounters:create` | DM→Main | src/main/ipc/encounter-handlers.ts:71 | handle | preload dm:invoke | no sender check |
| `encounters:delete` | DM→Main | src/main/ipc/encounter-handlers.ts:99 | handle | preload dm:invoke | no sender check |
| `encounters:list-by-campaign` | DM→Main | src/main/ipc/encounter-handlers.ts:57 | handle | preload dm:invoke | no sender check |
| `encounters:rename` | DM→Main | src/main/ipc/encounter-handlers.ts:93 | handle | preload dm:invoke | no sender check |
| `fog:get` | DM→Main | src/main/ipc/fog-handlers.ts:23 | handle | preload dm:invoke | no sender check |
| `fog:save` | DM→Main | src/main/ipc/fog-handlers.ts:35 | handle | preload dm:invoke | no sender check |
| `gm-pins:create` | DM→Main | src/main/ipc/gm-pin-handlers.ts:80 | handle | preload dm:invoke | no sender check |
| `gm-pins:delete` | DM→Main | src/main/ipc/gm-pin-handlers.ts:110 | handle | preload dm:invoke | no sender check |
| `gm-pins:list-by-map` | DM→Main | src/main/ipc/gm-pin-handlers.ts:72 | handle | preload dm:invoke | no sender check |
| `gm-pins:update` | DM→Main | src/main/ipc/gm-pin-handlers.ts:97 | handle | preload dm:invoke | no sender check |
| `handouts:count-by-campaigns` | DM→Main | src/main/ipc/handout-handlers.ts:52 | handle | preload dm:invoke | no sender check |
| `handouts:create` | DM→Main | src/main/ipc/handout-handlers.ts:69 | handle | preload dm:invoke | no sender check |
| `handouts:delete` | DM→Main | src/main/ipc/handout-handlers.ts:93 | handle | preload dm:invoke | no sender check |
| `handouts:list-by-campaign` | DM→Main | src/main/ipc/handout-handlers.ts:38 | handle | preload dm:invoke | no sender check |
| `initiative:create` | DM→Main | src/main/ipc/initiative-handlers.ts:103 | handle | preload dm:invoke | no sender check |
| `initiative:delete` | DM→Main | src/main/ipc/initiative-handlers.ts:155 | handle | preload dm:invoke | no sender check |
| `initiative:delete-by-map` | DM→Main | src/main/ipc/initiative-handlers.ts:160 | handle | preload dm:invoke | no sender check |
| `initiative:list-by-map` | DM→Main | src/main/ipc/initiative-handlers.ts:92 | handle | preload dm:invoke | no sender check |
| `initiative:update` | DM→Main | src/main/ipc/initiative-handlers.ts:123 | handle | preload dm:invoke | no sender check |
| `initiative:update-many` | DM→Main | src/main/ipc/initiative-handlers.ts:136 | handle | preload dm:invoke | no sender check |
| `maps:count` | DM→Main | src/main/ipc/map-handlers.ts:207 | handle | preload dm:invoke | no sender check |
| `maps:create` | DM→Main | src/main/ipc/map-handlers.ts:212 | handle | preload dm:invoke | no sender check |
| `maps:delete` | DM→Main | src/main/ipc/map-handlers.ts:250 | handle | preload dm:invoke | no sender check |
| `maps:list` | DM→Main | src/main/ipc/map-handlers.ts:136 | handle | preload dm:invoke | no sender check |
| `maps:list-for-stats` | DM→Main | src/main/ipc/map-handlers.ts:146 | handle | preload dm:invoke | no sender check |
| `maps:list-recent` | DM→Main | src/main/ipc/map-handlers.ts:173 | handle | preload dm:invoke | no sender check |
| `maps:patch-grid-display` | DM→Main | src/main/ipc/map-handlers.ts:308 | handle | preload dm:invoke | no sender check |
| `maps:rename` | DM→Main | src/main/ipc/map-handlers.ts:244 | handle | preload dm:invoke | no sender check |
| `maps:set-ambient-track` | DM→Main | src/main/ipc/map-handlers.ts:381 | handle | preload dm:invoke | no sender check |
| `maps:set-camera` | DM→Main | src/main/ipc/map-handlers.ts:364 | handle | preload dm:invoke | no sender check |
| `maps:set-channel-volume` | DM→Main | src/main/ipc/map-handlers.ts:392 | handle | preload dm:invoke | no sender check |
| `maps:set-grid` | DM→Main | src/main/ipc/map-handlers.ts:278 | handle | preload dm:invoke | no sender check |
| `maps:set-rotation` | DM→Main | src/main/ipc/map-handlers.ts:347 | handle | preload dm:invoke | no sender check |
| `maps:set-rotation-player` | DM→Main | src/main/ipc/map-handlers.ts:353 | handle | preload dm:invoke | no sender check |
| `maps:swap-order` | DM→Main | src/main/ipc/map-handlers.ts:258 | handle | preload dm:invoke | no sender check |
| `menu:action` | Main→DM | src/main/menu.ts:42 | send | preload dm:on |
| `notes:create` | DM→Main | src/main/ipc/note-handlers.ts:143 | handle | preload dm:invoke | no sender check |
| `notes:delete` | DM→Main | src/main/ipc/note-handlers.ts:181 | handle | preload dm:invoke | no sender check |
| `notes:list-category-by-campaign` | DM→Main | src/main/ipc/note-handlers.ts:110 | handle | preload dm:invoke | no sender check |
| `notes:list-category-by-map` | DM→Main | src/main/ipc/note-handlers.ts:126 | handle | preload dm:invoke | no sender check |
| `notes:update` | DM→Main | src/main/ipc/note-handlers.ts:163 | handle | preload dm:invoke | no sender check |
| `player:atmosphere` | DM→Player | src/main/ipc/player-bridge.ts:133 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:blackout` | DM→Player | src/main/ipc/player-bridge.ts:127 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:drawing` | DM→Player | src/main/ipc/player-bridge.ts:182 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:fog-delta` | DM→Player | src/main/ipc/player-bridge.ts:101 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:fog-reset` | DM→Player | src/main/ipc/player-bridge.ts:107 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:full-sync` | DM→Player | src/main/ipc/player-bridge.ts:82 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:handout` | DM→Player | src/main/ipc/player-bridge.ts:152 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:initiative` | DM→Player | src/main/ipc/player-bridge.ts:164 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:map-update` | DM→Player | src/main/ipc/player-bridge.ts:95 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:measure` | DM→Player | src/main/ipc/player-bridge.ts:176 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:overlay` | DM→Player | src/main/ipc/player-bridge.ts:158 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:pointer` | DM→Player | src/main/ipc/player-bridge.ts:139 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:request-sync` | Player→Main | src/main/ipc/player-bridge.ts:88 | on | sender-checked (isFromPlayer) | preload player:send |
| `player:token-delta` | DM→Player | src/main/ipc/player-bridge.ts:121 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:token-update` | DM→Player | src/main/ipc/player-bridge.ts:113 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:viewport` | DM→Player | src/main/ipc/player-bridge.ts:146 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:walls` | DM→Player | src/main/ipc/player-bridge.ts:188 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:weather` | DM→Player | src/main/ipc/player-bridge.ts:170 | on | sender-checked (isFromDM) | preload dm:send | preload player:on |
| `player:window-size` | Player→Main | src/main/ipc/player-bridge.ts:197 | on | sender-checked (isFromPlayer) | preload player:send |
| `rooms:create` | DM→Main | src/main/ipc/room-handlers.ts:130 | handle | preload dm:invoke | no sender check |
| `rooms:delete` | DM→Main | src/main/ipc/room-handlers.ts:188 | handle | preload dm:invoke | no sender check |
| `rooms:list-by-map` | DM→Main | src/main/ipc/room-handlers.ts:122 | handle | preload dm:invoke | no sender check |
| `rooms:restore` | DM→Main | src/main/ipc/room-handlers.ts:147 | handle | preload dm:invoke | no sender check |
| `rooms:update` | DM→Main | src/main/ipc/room-handlers.ts:175 | handle | preload dm:invoke | no sender check |
| `sessions:end-open` | DM→Main | src/main/ipc/session-handlers.ts:25 | handle | preload dm:invoke | no sender check |
| `sessions:start` | DM→Main | src/main/ipc/session-handlers.ts:20 | handle | preload dm:invoke | no sender check |
| `sessions:stats-by-campaigns` | DM→Main | src/main/ipc/session-handlers.ts:35 | handle | preload dm:invoke | no sender check |
| `token-templates:create` | DM→Main | src/main/ipc/token-template-handlers.ts:144 | handle | preload dm:invoke | no sender check |
| `token-templates:delete` | DM→Main | src/main/ipc/token-template-handlers.ts:182 | handle | preload dm:invoke | no sender check |
| `token-templates:list` | DM→Main | src/main/ipc/token-template-handlers.ts:132 | handle | preload dm:invoke | no sender check |
| `token-templates:list-user-names` | DM→Main | src/main/ipc/token-template-handlers.ts:137 | handle | preload dm:invoke | no sender check |
| `token-templates:update` | DM→Main | src/main/ipc/token-template-handlers.ts:167 | handle | preload dm:invoke | no sender check |
| `token-variants:import` | DM→Main | src/main/ipc/compendium-handlers.ts:230 | handle | preload dm:invoke | sender-aware |
| `token-variants:list` | DM→Main | src/main/ipc/compendium-handlers.ts:203 | handle | preload dm:invoke | no sender check |
| `token-variants:open-folder` | DM→Main | src/main/ipc/compendium-handlers.ts:262 | handle | preload dm:invoke | no sender check |
| `tokens:create` | DM→Main | src/main/ipc/token-handlers.ts:214 | handle | preload dm:invoke | no sender check |
| `tokens:delete` | DM→Main | src/main/ipc/token-handlers.ts:280 | handle | preload dm:invoke | no sender check |
| `tokens:delete-many` | DM→Main | src/main/ipc/token-handlers.ts:289 | handle | preload dm:invoke | no sender check |
| `tokens:list-by-map` | DM→Main | src/main/ipc/token-handlers.ts:206 | handle | preload dm:invoke | no sender check |
| `tokens:restore` | DM→Main | src/main/ipc/token-handlers.ts:223 | handle | preload dm:invoke | no sender check |
| `tokens:restore-many` | DM→Main | src/main/ipc/token-handlers.ts:233 | handle | preload dm:invoke | no sender check |
| `tokens:update` | DM→Main | src/main/ipc/token-handlers.ts:248 | handle | preload dm:invoke | no sender check |
| `tokens:update-many` | DM→Main | src/main/ipc/token-handlers.ts:261 | handle | preload dm:invoke | no sender check |
| `tracks:create` | DM→Main | src/main/ipc/audio-board-handlers.ts:228 | handle | preload dm:invoke | no sender check |
| `tracks:delete` | DM→Main | src/main/ipc/audio-board-handlers.ts:312 | handle | preload dm:invoke | no sender check |
| `tracks:list-by-campaign` | DM→Main | src/main/ipc/audio-board-handlers.ts:183 | handle | preload dm:invoke | no sender check |
| `tracks:toggle-assignment` | DM→Main | src/main/ipc/audio-board-handlers.ts:319 | handle | preload dm:invoke | no sender check |
| `tracks:update` | DM→Main | src/main/ipc/audio-board-handlers.ts:274 | handle | preload dm:invoke | no sender check |
| `walls:create` | DM→Main | src/main/ipc/wall-handlers.ts:75 | handle | preload dm:invoke | no sender check |
| `walls:delete` | DM→Main | src/main/ipc/wall-handlers.ts:153 | handle | preload dm:invoke | no sender check |
| `walls:list-by-map` | DM→Main | src/main/ipc/wall-handlers.ts:67 | handle | preload dm:invoke | no sender check |
| `walls:restore` | DM→Main | src/main/ipc/wall-handlers.ts:108 | handle | preload dm:invoke | no sender check |
| `walls:update` | DM→Main | src/main/ipc/wall-handlers.ts:128 | handle | preload dm:invoke | no sender check |
| `wiki:delete-user-entry` | DM→Main | src/main/ipc/data-handlers.ts:444 | handle | preload dm:invoke | no sender check |
| `wiki:upsert-user-entry` | DM→Main | src/main/ipc/data-handlers.ts:398 | handle | preload dm:invoke | no sender check |
