-- ============================================
-- Le Syndicat des Tox - MD5 Helper
-- ============================================
-- Lua script for generating MD5 hash of IP address
-- Used for anonymous ID generation

local resty_md5 = require "resty.md5"
local str = require "resty.string"

-- Get the input from nginx variable
local input = ngx.var.anonymous_id_source

-- Create MD5 hash
local md5 = resty_md5:new()
if not md5 then
    ngx.log(ngx.ERR, "Failed to create MD5 object")
    ngx.var.anonymous_id = "error"
    return
end

local ok = md5:update(input)
if not ok then
    ngx.log(ngx.ERR, "Failed to update MD5")
    ngx.var.anonymous_id = "error"
    return
end

local digest = md5:final()
local hash = str.to_hex(digest)

-- Set the nginx variable
ngx.var.anonymous_id = hash
