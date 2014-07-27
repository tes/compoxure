# Page Composer Service

Composition proxy replacement for ESI or SSI uses [node-trumpet](https://github.com/substack/node-trumpet) to parse HTML from backend services and compose fragments from microservices into the response.

Build Status: [![Build Status](https://travis-ci.org/TSLEducation/compoxure.svg?branch=master)](https://travis-ci.org/TSLEducation/compoxure)
Dependencies: [![Dependencies](https://david-dm.org/tsleducation/compoxure.png)](https://david-dm.org/tsleducation/compoxure.png)
## Running Example App

```bash
git clone git@github.com:TSLEducation/compoxure.git
cd compoxure
npm install
node ./examples/app
```
Visit [http://localhost:5000/](http://localhost:5000/)

## What is it

Page composer is a composition proxy - you put it in front of a back end service that acts as a template into which content from microservices is composed.  It is designed to be simple, fast and failure tolerant - e.g. you won't need to build complex patterns around micro services to deal with failure scenarios.  

## How it works

You have a back end service (e.g. a CMS) that returns HTML (with or without the declarative markup explained below), Page composer then parses the HTML on the way through and makes any requests to other micro services that are then inserted into the HTML on the way through.  The various responses (e.g. the backend HTML page, each service fragment response) can all be cached at differing TTLs (or not at all) and using a simple key construction method that covers the scenario that some fragments may differ for not logged in users vs logged in users.

Typically the backend service will be a CMS or a static HTML page containing specific markup.

This allows the following:

CMS = Return base HTML page layout, with special declarations when it wants to include something more complex from another app, e.g.
Application = Return a fragment of HTML that can be included in a parent page (more than one).

```html
<div cx-url='{{server:local}}/application/widget/{{cookie:userId}}' cx-cache-ttl='10s' cx-cache-key='widget:user:{{cookie:userId}}' cx-timeout='1s' cx-statsd-key="widget_user">
     This content will be replaced on the way through
</div>
```

Alternatively you can use the configuration based approach, in the configuration file adding a 'transformations' section like
below:

```html
<div id='ApplicationWidget'>
     This content will be replaced on the way through
</div>
```
Configuration based composition then looks as follows:
```json
"transformations":{
   "ApplicationWidget": {
       "type": "replacement",
       "query": "#ApplicationWidget",
       "url": "{{server:local}}//application/widget/{{cookie:userId}}",
       "cacheKey":"widget:user:{{cookie:userId}}",
       "cacheTTL":"10s",
       "timeout": "1s",
       "statsdKey":"widget_user"
   }
}
```
There are pros and cons to both approaches, with the declarative approach being simplest to manage if you have full control over the back end CMS and it is easy to change, or the configuration based approach if you want to control everything at the proxy layer (e.g. you are replacing chunks of an existing page that is difficult to change).

### Configuration

The full configuration options can be found in /config/default.json, with a file per TSL_ENV that can be used to over-write or add any additional configuration per environment.  I will explain the main ones here:

```json
{
    "backend": {
        "target":"http://localhost:5001",
        "host":"localhost",
        "ttl":"10s",
        "quietFailure":false,
        "replaceOuter":false
    },
    "parameters": {
        "urls": [
            {"pattern": "/teaching-resource/.*-(\\d+)", "names": ["resourceId"]}
        ],
        "servers": {
            "local": "http://localhost:5001"
        }
    },
    "logging": {
        "transports": {
            "console": {
                "transport": "Console",
                "level": "debug",
                "timestamp": true,
                "colorize": true
            }
        }
    },
    "cache": {
        "engine": "redis"
    },
    "transformations":{
        "HeaderReplacement": {
            "type": "replacement",
            "query": "#ReplaceHeader",
            "url": "{{server:local}}/delayed",
            "cacheKey":"delayed1",
            "cacheTTL":"10s",
            "timeout": "1s"
        },
        "DeclarativeReplacement": {
            "type":"replacement",
            "query": "[cx-url]"
        }
    }
}
```

#### Backend

These properties configure the backend server that the initial request goes to grab the HTML that is then processed.

|Property|Description|
---------|------------
|target|The base URL to the backend service that will serve HTML.  URLs are passed directly through, so /blah will be passed through to the backend as http://backend/blah|
|host|The name to be passed through in the request (given the hostname of compoxure is likely to be different to that of the backend server.  The host is used as the key for all the statds stats.|
|ttl|The amount of time to cache the backend response (TODO : make it honor cache headers)|
|timeout|Time to wait for backend to respond - should set low|
|quietFailure|Used to determine if page composer will serve some error text in response to a microservice failure or fail silently (e.g. serve nothing into the space).
|replaceOuter|Used to configure if page composer will replace the outer HTML element or not (default is NOT).  If you replace the outer element then the response from the micro service will completely replace the matching element|
|dontPassUrl|Used to decide if the URL in the request is passed through to the backend.  Set to true if the backend should ignore the front URL and just serve the same page for all requests (e.g. a template)|

Additionally, you can define multiple backends, by replacing the above simple configuration with a servers declaration that adds an additional 'pattern' regex parameter to select the backend based on the incoming path.  The first match wins.

```json
 "backend": {
        "servers": [{
            "pattern": "/teaching-resource/.*",
            "target":"http://www.kyotosolutions.co.uk",
            "host":"www.kyotosolutions.co.uk",
            "ttl":"10s",
            "replaceOuter":false,
            "quietFailure":true 
        },
        {
            "pattern": ".*",
            "target":"http://localhost:5001",
            "host":"localhost",
            "ttl":"10s",
            "replaceOuter": false,
            "quietFailure": true 
        }]
    }
```

#### Parameters

The parameters section provides configuration that allows page composer to use data from the initial request (and config) to pass through to microservices (e.g. url parameters, values from the url path via regex, static server names to avoid duplication).

|Property|Description|
---------|------------
urls|This is an array of objects containing pattern / names values.  Pattern is a regex used to parse the request hitting page composer, names are the names to assign to the matches from the regex. All of the patterns are executed against the incoming URL, and any matches added to the parameters that can then be used in the microservice requests.  The full list of these are found below.
servers|A list of server name to server URL configurations that can be used to avoid repetition of server names in your fragments

#### Cache Engine

Page composer allows caching of both the back end response and page fragments.  This is currently done using Redis, but other cache engines could be put in place.

Note that the cache implementation in Redis is not done using TTLs, as this means that once Redis expires a key if the backend service is down that page composer will serve a broken page.  It is instead done slightly differently to allow for the situation that serving stale content is better than serving no content (this is one of the safe failure modes).

To disable caching simply delete the entire config section.

|Property|Description|
---------|------------
engine|The engine to use (currently only 'redis' is valid).

#### Transformations

The heart of Page Composer is the transformation area.  This is where you can add your own selector based transformations, or simply leave the default declarative transformation:

```json
     "DeclarativeReplacement": {
            "type":"replacement",
            "query": "[cx-url]"
        }
     }
```
Do not delete this transformation if you want the declarative code to work!  The properties of new transformations are as follows:

|Property|Description|
---------|------------
type|The type of transformation to apply to the matching selector (currently only 'replacement' is valid).
query|The selector (see trumpet config) that the replacement will be applied to
url|The url to call to get the content to put into the section matching the selector (specific to replacement).
cacheKey|The key to use to cache the response
cacheTTL|The time to cache the response
statsdKey|The key to use in reporting stats to statds, if not set will use cacheKey
timeout|The timeout to wait for the service to respond

Note that page composer will always try to fail gracefully and serve as much of the page as possible.

### Declarative Parameters

To use page composer in a declarative fashion, simply add the following tags to any HTML element.  The replacement is within the element, so the element containing the declarations will remain.  The element can be anything (div, span), the only requirement is that the cx-url attribute exist.

**Warning:**
When using page composer params within a mustache/handlebars template you must escape the page composer params e.g. ```\{{server:resource-list}}```

|Property|Description|
---------|------------
cx-url|The url to call to get the content to put into the section matching the selector (specific to replacement).
cx-cache-key|The key to use to cache the response (if blank it will use the cx-url to create a cache key)
cx-cache-ttl|The time to cache the response (set to zero for no cache - defaults to 60s).
cx-statsd-key|The key to use to report stats to statsd, defaults to cache-key if not set.
cx-timeout|The timeout to wait for the service to respond.
cx-no-cache|Explicit instruction to not cache when value="true", overrides all other cache instruction.


```html
<div cx-url='{{server:local}}/application/widget' cx-cache-ttl='10s' cx-cache-key='widget:user:{{cookie:userId}}' cx-timeout='1s' cx-statsd-key="widget_user">
     This content will be replaced on the way through
</div>
```

## Using parameters and substitution in strings

Page composer allows you to use mustache like templates for a number of strings, specifically URL and Cache Key fields tend to allow the use of variables.  The possible variables are:

|Prefix|Description|Example|
-------|-----------|--------
param|Parameters matched from the parameters configuration (regex + name) pairs in the configuration|/resource/{{param:resourceId}}
query|Parameters matched from any query string key values in the incoming URL|/user/{{query:userId}}
url|Any elements of the incoming url (search, query, pathname, path, href)|/search{{url:search}}
cookie|Any cookie value|/user/{{cookie:TSL_UserID}}
header|Any incoming header value|/user/feature/{{header:x-feature-enabled}}
server|A server short name from the configuration in the parameters section of config|{{server:feature}}/feature

Note that you can add an additional :encoded key to any parameter to get the value url encoded (e.g. {{url:search:encoded}})

To see a list of all the params for a given request (this will be based on your browser so just indicative) you can use the following on a compoxure server:

[http://localhost:5000/interrorgate/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420/](http://localhost:5000/interrorgate/teaching-resource/Queen-Elizabeth-II-Diamond-jubilee-2012-6206420/)

## From Cache Only

Note that the reason that we designed page composer to allow full control over cache keys was to support the use case of pre-warming a cache with content at given keys - e.g. so you could have a backend job that populated the cache with content so you never actually got a cache miss and called the backend service itself.

e.g. the HTML below would fail silently and quickly in the instance the cache didn't have content, but expects the cache to be loaded:

```html
<div cx-url='cache' cx-cache-key='latest:news'>
     This will contain the latest news that is expected to be pre-populated by a job in the cache.
</div>
```

To do: build an API for the cache that enables jobs to do this without directly talking to Redis.

## Settings Time Intervals

Page composer uses a number of time intervals for timeouts and TTLS. To make this simpler, there is a simple library that can convert basic string based intervals into ms.

e.g. 1s = 1000, 1m = 60*1000 etc.  The valid values are 1s, 1m, 1h, 1d.  If you do not provide a suffix it assumes ms.

## Stub Server

To assist with local development, there is a very simple stub server that can be invoked by simply adding --config=./config/stub.json as a parameter when running, this will spin up a simple HTTP server that will respond to the URL configured as the backend.

## Alternatives

We built page composer because it solved a set of problems that alternative solutions didn't quite reach.

Ajax: In single page apps you can easily use client side javascript to build a single application based on top of multiple underlying microservices.  However, this doesn't work when you need to deliver a typical content heavy website where SEO is important - e.g. you have a mixture of content and app.  We need to deliver a page, and then progressively enhance it via javascript.  We use Ajax, just not for the initial hit.

SSI:  Server side includes (e.g. in nginx) can pull together outputs from services into a single response, and it also can enable some level of caching of both the response and each fragment.  However, it can be quite challenging to setup and the final solution doesn't allow programmatic interaction with the cache or fine grained control over the cache keys (e.g. based on cookie, url params, query params or header values).

See: http://syshero.org/post/50498184831/simulate-basic-esi-using-nginx-and-ssi

ESI:  Edge side includes (e.g. in Varnish or Akamai) are an enhanced version of SSI, and Akamai in particular has a full implementation of the entire ESI language.  This is however very proprietary and locks you into Akamai, there are also restrictions on the number of ESI includes on a single page.  The ESI language itself is quiet dated and pollutes your pages with pseudo XML markup.

See: http://blog.lavoie.sl/2013/08/varnish-esi-and-cookies.html

'Front End' server:  The final option is to simply build a service that's purpose in life is aggregating backend services together into pages programmatically.  e.g. a controller that calls out to a number of services and passes their combined responses into a view layer in a traditional web app.  The problem with this approach is this server now becomes a single monolithic impediment to fast release cycles, and each of the service wrappers in the front end app will now need to implement circuit breaker and other patterns to ensure this app doesn't die, taking down all of the pages and services it fronts, when any of the underlying servics die.






