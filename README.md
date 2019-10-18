# Compoxure Composition Middleware
[![Build Status](https://travis-ci.org/tes/compoxure.svg?branch=master)](https://travis-ci.org/tes/compoxure) [![Dependencies](https://david-dm.org/tes/compoxure.svg)](https://david-dm.org/tes/compoxure) [![Coverage Status](https://img.shields.io/coveralls/tes/compoxure.svg)](https://coveralls.io/r/tes/compoxure?branch=master)

Composition proxy replacement for ESI or SSI uses [htmlparser2](https://github.com/fb55/htmlparser2/) to parse HTML from backend services and compose fragments from microservices into the response.  This is exposed as Express middleware to allow quick creation of a proxy server.

If you are looking for a almost 'ready to use' server that has the middleware configured with some examples, please look here:  https://github.com/tes/compoxure-example

For rationale (e.g. why the heck would anyone build this), please see the rationale section at the bottom.

## Running Example App

```bash
git clone git@github.com:tes/compoxure.git
cd compoxure
npm run start
```
Visit [http://localhost:5000/](http://localhost:5000/)

## What is it

Compoxure is a composition proxy - you put it in front of a back end service that acts as a template into which content from microservices is composed.  It is designed to be simple, fast and failure tolerant - e.g. you won't need to build complex patterns across and around all of your micro services to deal with failure scenarios, they just serve out HTML and should try to fail fast.

## Examples of usage

 - Branding: Imagine that you need to share common branding (masthead, navigation, footer) across a range of applications.  You can put this in front of the application and it can then include these elements in the page from a common set of microservices responsible for each.

 - Expose an app within a CMS: Instead of building your apps in your CMS (arrgh) instead include them in CMS managed pages with a simple declaration.  The apps won't need to know about the site branding, the CMS takes care of all of that.  Also makes it easy to have those apps expose small amounts of functionality across your site (e.g. small Top 10 lists etc.).

 - Complex application decomposition:  Image you have to deliver a page that has some product data, as well as a range of content that depends on the user.  Compoxure will let you serve these fragments of the page at different TTLs, and if you add middleware that parses your user cookie it can actually pass back user information to these services so they dont have to - making those easier to test and reason about.

## How it works

You have a back end service (e.g. a CMS) that returns HTML containing the declarative markup explained below. Compoxure then responds to requests, calling the backend service that matches the URL, parses the HTML it returns and makes any requests to other micro services whose responses are then inserted into the HTML on the way through.

The various responses (e.g. the backend HTML page, each service fragment response) can all be cached at differing TTLs (or not at all) and using a simple key construction method that covers the scenario that some fragments may differ for not logged in users vs logged in users.

Typically the backend service will be a CMS or a static HTML page containing specific markup, with the thing that is included being the output of more complex applications.

```html
<div cx-url='{{server:local}}/application/widget/{{cookie:userId}}' cx-cache-ttl='10s' cx-cache-key='widget:user:{{cookie:userId}}' cx-timeout='1s' cx-statsd-key="widget_user">
     This content will be replaced on the way through
</div>
```

### Configuration

The full configuration options can be found in /examples/example.json, but it is expected that you will store this configuration within your own application and pass it through into the middleware.

The configuration object looks as follows:

```json
{
    "backend": [{
        "pattern": ".*",
        "target":"http://www.tes.co.uk",
        "host":"www.tes.co.uk",
        "ttl":"10s",
        "quietFailure":false,
        "leaveContentOnFail":false,
        "dontPassUrl":false,
        "passThrough":false,
        "cacheKey":"{{url:path}}",
        "contentTypes":["html"]
    }],
    "parameters": {
        "urls": [
            {"pattern": "/teaching-resource/.*-(\\d+)", "names": ["resourceId"]}
        ],
        "urlGroups": [
            {"pattern": "/teaching-resource*", "group": "resources"}
            {"pattern": ".*", "group": "home"}
        ],
        "servers": {
            "local": "http://localhost:5001"
        }
    },
    "cdn": {
        "url": "https://server.cloudfront.net",
    },
    "environment":{
        "name":"development"
    },
    "hogan":{
        "delimiters":"{{ }}"
    },
    "cache": {
        "defaultNoCacheHeaders": {
          "cache-control": "private, no-cache, max-age=0, must-revalidate, no-store"
        },
        "engine": "redis"
    },
    "followRedirect": false,
    "fragmentDepth": 5
}
```

#### Backend

These properties configure the backend server that the initial request goes to grab the HTML that is then processed.

| Property           | Description |
|--------------------|-------------|
| pattern            | The regexp used to select this backend based on the incoming request to compoxure.  First match wins.|
| fn                 | Name of a selector function of type: function(req, variables) { return true; } to allow more dynamic selection of backend (instead of pattern).  Function must be passed in on the config.functions object, and is referenced by name.|
| target             | The base URL to the backend service that will serve HTML.  URLs are passed directly through, so /blah will be passed through to the backend as http://backend/blah|
| host               | The name to be passed through in the request (given the hostname of compoxure is likely to be different to that of the backend server.  The host is used as the key for all the statds stats.|
| ttl                | The amount of time to cache the backend response (TODO : make it honor cache headers)|
| timeout            | Time to wait for backend to respond - should set low|
| quietFailure       | Used to determine if compoxure will serve some error text in response to a microservice failure or fail silently (e.g. serve nothing into the space).
| dontPassUrl        | Used to decide if the URL in the request is passed through to the backend.  Set to true if the backend should ignore the front URL and just serve the same page for all requests (e.g. a fixed template)|
| contentTypes       | An array of content types which are accepted by this backend. Defaults to `['html']`. See the [accepts](https://www.npmjs.org/package/accepts) documentation regarding how headers are parsed. *Note: The order is important! We recommend that you always put `html` as the first item in the array; an exception to this is if you need to allow requests for Javascript files through unparsed - for example if you need to make a request for a service worker script to the same domain as your page and can't request it from a CDN host; in which case use ['application/javascript', 'html'] in combination with passThrough: true. |
| passThrough        | Defaults to false, but if set to true it will proxy all non HTML assets through completely un-parsed. It's best to serve static assets like Javascript and CSS from a CDN so the requests don't go through Compoxure, but there could be exceptions to this, eg service workers that have to be requested from the same domain as the app (for this case, also see contentTypes config option above). |
| headers            | An array of header names to specify headers forwarded to the backend server. |
| cacheKey            | Cache key to use for requests to this backend |
| noCache            | ~~Do not cache this backend.~~ Deprecated - caching is now off by default |
| tags            | a space separated list of tags. They are used to mark a cached item, so they should be easy to bulk delete |
| passThroughHeaders | Pass this array of headers to the client if the backend sets them. E.g., `"passThroughHeaders": ["x-robot-tag","cache-control"]`|
| addResponseHeaders | Set the response headers in this map always. E.g., `"addResponseHeaders": { "x-robots-tag": "noindex" }`.  You can use template variables in these headers.

You can define multiple backends, by adding as many declarations for backends as you like, with differing patterns.  The first match wins e.g.

```json
 "backend": [{
        "fn": "selectResource",
        "target":"http://www.tes.co.uk",
        "host":"www.tes.co.uk",
        "ttl":"10s",
        "cacheKey":"{{param:resourceId}}",
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
```

In this example, the selectResource function is passed in with the configuration when configuring the middleware:

```js
config.functions = {
  'selectResource': function(req, variables) {
    if(variables['param:resourceId']) return true;
  }
}
```

#### Parameters

The parameters section provides configuration that allows compoxure to use data from the initial request (and config) to pass through to microservices (e.g. url parameters, values from the url path via regex, static server names to avoid duplication).

|Property|Description|
---------|------------
urls|This is an array of objects containing pattern / names values.  Pattern is a regex used to parse the request hitting page composer, names are the names to assign to the matches from the regex. All of the patterns are executed against the incoming URL, and any matches added to the parameters that can then be used in the microservice requests.  The full list of these are found below.
query|This is an array of objects containing key / mapTo values. Key is the query parameter name, mapTo is the name to assign the value. The values are added to the parameters that can then be used in the microservice requests.  The full list of these are found below.
servers|A list of server name to server URL configurations that can be used to avoid repetition of server names in your fragments

#### Allowing backends to render their own error pages

You can now add an array parameter to config:

```
{
  renderContentOnErrorCode: [403]
}
```

This configuration means that compoxure will take the content rendered (along with the error), and render that through to the end user, this is in place of a bland compoxure error string indicating that the backend served a 403.

This response is parsed.

#### Cache Engine

Compoxure allows caching of both the back end response and page fragments.  This is currently done using Redis, but other cache engines could be put in place.

Note that the cache implementation in Redis is not done using TTLs, as this means that once Redis expires a key if the backend service is down that compoxure will serve a broken page.  It is instead done slightly differently to allow for the situation that serving stale content is better than serving no content (this is one of the safe failure modes).

To disable caching simply delete the entire config section.

|Property|Description|
---------|------------
defaultNoCacheHeaders|Headers to automatically append to any response that is not cached (optional)
engine|The engine to use: 'nocache', 'memorycache', 'redis'.
url|If Redis, set a url for the redis server - e.g. localhost:6379?db=0
host|If Redis, set the host explicitly (this and params below are an alternative to using url)
port|If Redis, set the port explicitly
db|If Redis, set the db explicitly
options|If redis, any option described at https://github.com/NodeRedis/node_redis#options-object-properties (e.g. to allow authentication)
compress|Use snappy compression for caching
namespace|Optional prefix for redis keys

#### Conditional GET request & Etag

HTTP conditional requests are requests that are executed differently, depending on the value of specific headers. In the `htmlparser.js`, we implement the entity tag, or the etag, as the validator to determine if the resource/content stored on the server matches a specific version.  We calculate the etag hash if we can cache the page (meaning, there are no fragments with no-cache specified), and return statusCode _304_ (Not modified) when the ETags match to that of the request header _"If-None-Match"_, _200_ otherwise. When we return statusCode _304_ it indicates that there is no need for the server to send a resource/content because the request indicates that the client, which made the request conditional, already has a valid content; the server is therefore redirecting the client to make use of that stored content as if it were the payload of a 200 OK response.

#### CDN Configuration

Compoxure can pass through CDN configuration through to each of the backend services, this is to allow them to render any links required to images or other static assets.

The configuration here is passed through to the services via two headers:

 - x-cdn-host : maps to cdn host property (deprecated)
 - x-cdn-url : full url to use as based for CDN

|Property|Description|
---------|------------
host|The hostname of the CDN - e.g. cdn.tes.co.uk
url|Full url - e.g. https://cdn.tes.co.uk/assets/ - required
resolver|Resolver function (see below)

If you provider a resolver function, it needs to be of the form:

```js
config.cdn.resolver = function(service) {
  if (service = 'one') {
    return 'https://base.cdn.path/';
  }
}
```

This allows you to lookup the CDN to use for a specific bundle based on the name of the service (however you choose to).  You must still pass the default url, as this is the fallback.
If you use the option "useRelativeURL: true" the CDNURL will be translated (if possible) in an url relative to the domain.

#### Status Code Handlers

You can specify a function to be executed if any of your backend services return with a specific HTTP Status Code. This  allows you to do things like redirect a user request to a login page if a request returns 401 or 403.

|Property|Description|
---------|-----------
*statusCode*:fn|The name of the function to be executed when this statusCode is encountered. This function has to be available as a property on the config.functions and will receive the arguments *req, res, variables, data*
*statusCode*:data|An object that will be passed to the function when called. An example of using this function would be to add the redirect link when a 401 of 403 code is encountered.

```json
 "statusCodeHandlers": {
   "403": {
     "fn":"handleUnauthorised",
       "data": {
         "redirect":"https://account.tes.co.uk/LogOn?rtn=<%= url%>"
       }
   },{
    "401": {
      "fn":"handleUnauthorised",
       "data": {
         "redirect":"https://account.tes.co.uk/LogOn?rtn=<%= url%>"
       }
    }
 }
```

The function has a signature of:

```
(req, res, variables, data, options, error) => {}
```

#### Follow Redirect

There is one final parameter, which is 'followRedirect'.  This applies to the request library used to retrieve fragments.  The default for this value is true, which means that if this configuration is not supplied as false, that if a fragment issues a 301 or 302 then Compoxure will follow it and retrieve the content from that new location and cache it.

If you set this property to false, this means that you can write a status code handler (see above) to capture a 301 or 302 from a fragment, and have the entire page follow to the location specified.

An example handler below (from the Compoxure tests):

```js
 'handle302': function(req, res, variables, data, options, err, responseCallback) {
      res.writeHead(302, {location: err.headers.location});
      res.end('');
  }
```

You can use the `responseCallback` function to respond with HTML that would be rendered within any errored fragment:

```js
 'handle600': function(req, res, variables, data, options, err, responseCallback) {
      responseCallback('html to render on any status code of this type');
  }
```

#### Environment

Environment can be set in config, so it can be used as a parameter.

|Property|Description|
---------|------------
name|Environment name, defaults to NODE_ENV or 'development' if NODE_ENV not supplied.


#### Hogan

Compoxure uses Hogan to parse string templates.  If you are also using a mustache language as your templating language, and are embedding Compoxure directives in templates, this will conflict.

The best option here is to use a different delimiter for Compoxure, and this can be configured via the hogan configuration option:


|Property|Description|
---------|------------
delimiters|New delimiter string - e.g. '<% %>'

#### Layout engine and Slots

You can use this feature to push some sections of a template in a layout.

To get this feature to work, you need a few things setup:

1. An endpoint (service) that serves a HTML page that forms the layout, that contains 'define slots'.
2. An application that serves the correct headers, and a fragment of HTML that with 'use slots'

The headers your application needs to send are:

```
{
  'cx-layout': 'http://www.example.com/layout.html',
  'cx-parse-me': 'true'
}
```

The layout should contain some slot definition:

```html
...
<h1>I am the layout</h1>
<div cx-define-slot="slot1">
  <p>Default content of the slot 1</p>
</div>
...
<div cx-define-slot="slot2">
  <p>Default content of the slot 2</p>
</div>
...
```

The application then should respond with some HTML that describes what to put in each slot:

```html
...
<div cx-use-slot="slot1">
  <p>This is the content of slot 1</p>
</div>
...
```

If a slot is not provided the default content will be used.

So this will be output:

```html
...
<h1>I am the layout</h1>
<div>
  <p>This is the content of slot 1</p>
</div>
...
<div>
  <p>Default content of the slot 2</p>
</div>
...
```

If there is more than one cx-use-slot with the same name, the content of all of them will be concatenated.

This can be useful if fragments from different services want to add the content in the same place.

Note: By default only content assigned to a slot from the initial content request will be considered for loading into a slot.

If you want to have nested fragments load content into the slots defined as part of the layout then you will need to have an additional header returned by your first content response.  In addition to the cx-layout and cx-parse-me headers you will need to assign the cx-allow-slot-use header.  For example:

```
{
  'cx-layout': 'http://www.example.com/layout.html',
  'cx-parse-me': 'true',
  'cx-allow-slot-use': 'true',
}
```

This configuration causes an additional parse of the initial content response to take place so has been added as an opt in option to keep the performance stable for exising applications.

#### Nested Fragments

Compoxure will parse fragments within fragments up to ```fragmentDepth``` deep. If not specified with default to 5. For this to remain performant, a service responding with a fragment containing compoxure directives will need also send a response header of ```cx-parse-me: true```.

i.e.

Component1
```html
<div>
  <p>Widget 1</p>
</div>
```

Component2

```html
<div>
  <p>Widget Two</p>
  <div cx-url='{{server:local}}/application/component1'></div>
</div>
```

Root

```html
<body>
  <div cx-url='{{server:local}}/application/component2'></div>
</body>
```

Result of rendering Root:

```html
<body>
  <div cx-url='{{server:local}}/application/component2'>
    <div>
      <p>Widget Two</p>
      <div cx-url='{{server:local}}/application/component1'>
        <div>
          <p>Widget 1</p>
        </div>
      </div>
    </div>
  </div>
</body>
```

### Declarative Parameters

To use compoxure in a declarative fashion, simply add the following tags to any HTML element.  The replacement is within the element, so the element containing the declarations will remain.  The element can be anything (div, span), the only requirement is that the cx-url attribute exists.

**Warning:**
As composure uses a mustache syntax for variable substition, when using compoxure params within a mustache/handlebars template you must escape the page composer params e.g. ```\{{server:resource-list}}``` or change the delimiter in the hogan configuration.

|Property|Description|
---------|------------
cx-url|The url to call to get the content to put into the section matching the selector (specific to replacement).
cx-cache-key|The key to use to cache the response, if none provided compoxure will not cache.
cx-cache-ttl|The time to cache the response.
cx-statsd-key|The key to use to report stats to statsd, defaults to cache-key if not set.
cx-timeout|The timeout to wait for the service to respond.
cx-no-cache|Explicit instruction to not cache when value value eval's to true, overrides all other cache instruction (deprecated - compoxure no longer caches by default)
cx-replace-outer|Whether to completely replace the outer HTML element. Overrides configuration in backend.
cx-test|Use to test a string, it will parse the string and output that (e.g. change cx-url to cx-test to test)
cx-ignore-404|If this call returns a 404 then dont pass it up and 404 the entire page, defaults to TRUE.
cx-ignore-error|Set to true to ignore all errors (non 200), or provide a comma delimited list to ignore specific errors on this fragment


```html
<div cx-url='{{server:local}}/application/widget' cx-cache-ttl='10s' cx-cache-key='widget:user:{{cookie:userId}}' cx-timeout='1s' cx-statsd-key="widget_user">
     This content will be replaced on the way through
</div>
```

Example of dynamic cx-no-cache:

```html
<div cx-url='{{server:local}}/application/widget' cx-cache-ttl='10s' cx-no-cache="\{{cookie:userId}}==={{authorId}}" cx-cache-key='widget:user:{{cookie:userId}}' cx-timeout='1s' cx-statsd-key="widget_user">
     This content won't be cached if the user is the author of the widget
</div>
```

## Using parameters and substitution in strings

Page composer allows you to use mustache like templates for a number of strings, specifically URL and Cache Key fields tend to allow the use of variables.  The possible variables are:

|Prefix|Description|Example|
-------|-----------|--------
param|Parameters matched from the parameters configuration (regex + name) pairs in the configuration|/resource/{{param:resourceId}}
query|Parameters matched from any query string key values in the incoming URL|/user/{{query:userId}}
url|Any elements of the incoming url (search, query, pathname, path, href, group)|/search{{url:search}}
cookie|Any cookie value|/user/{{cookie:TSL_UserID}}
header|Any incoming header value|/user/feature/{{header:x-feature-enabled}}
server|A server short name from the configuration in the parameters section of config|{{server:feature}}/feature
env|Environment, property available is name e.g. {{env:name}}
cdn|CDN configuration, properties available are host and url e.g. {{cdn:url}}
user|User properties, if set on the request as property user - e.g. req.user = {name: bob} >> {{user:name}}. Also a 'loggedIn' boolean property is set on user eg {{user:loggedIn}}
device|Device type {{device:type}} = desktop|phone|tablet
layout|This is the layout url (available only after getting the response, useful for cacheKey)|{{layout}}

Note: It also passes the device:type down to downstreams in a header - as 'x-device'.

Note that you can add an additional :encoded key to any parameter to get the value url encoded (e.g. {{url:search:encoded}}).  An example set is shown below.  Note that they will vary depending on your request, parameter configuration, cookies etc.

```
{ 'param:resourceId': '123456',
  'url:protocol': 'http:',
  'url:slashes': true,
  'url:auth': null,
  'url:host': 'localhost:5000',
  'url:port': '5000',
  'url:hostname': 'localhost',
  'url:hash': null,
  'url:search': '?param=true',
  'url:query': 'param=true',
  'url:pathname': '/resource/123456',
  'url:path': '/resource/123456?param=true',
  'url:href': 'http://localhost:5000/resource/123456?param=true',
  'url:group': 'resources',
  'cookie:example': '12345',
  'header:host': 'localhost:5000',
  'header:connection': 'keep-alive',
  'header:accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'header:user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/36.0.1985.125 Safari/537.36',
  'header:referer': 'http://localhost:5000/',
  'header:accept-encoding': 'gzip,deflate,sdch',
  'header:accept-language': 'en-GB,en-US;q=0.8,en;q=0.6',
  'header:cookie': 'example=12345',
  'server:local': 'http://localhost:5001',
  'env:name': 'development',
  'user:userId': '_',
  'device:type': 'phone'
  }
  ```

## Multiple urls in cx-url and strategy
You can optionally have multiple ```cx-url``` attributes with different suffixes. All the contents will be retrieved and will be added to the html. You can modify the default behaviour using the ```cx-strategy``` attribute. These are the currently supported strategies:
* ```default```: all the contents
* ```first-non-empty```: this is returning the first non empty content
* ```random```: this is returning a random content
When you have multiple urls you can also have multiple versions of these attributes having the same suffix: cx-cache-key, cx-timeout, cx-ttl, cx-no-cache.
For example:
```html
<div cx-url-1="{{server:name}}/path1" cx-url-2="{{server:name}}/path2" cx-cache-key-1="content1" cx-cache-key-2="content2" cx-strategy="random"></div>
```

## From Cache Only

Note that the reason that we designed compoxure to allow full control over cache keys was to support the use case of pre-warming a cache with content at given keys - e.g. so you could have a backend job that populated the cache with content so you never actually got a cache miss and called the backend service itself.

e.g. the HTML below would fail silently and quickly in the instance the cache didn't have content, but expects the cache to be loaded:

```html
<div cx-url='cache' cx-cache-key='latest:news'>
     This will contain the latest news that is expected to be pre-populated by a job in the cache.
</div>
```

To do: build an API for the cache that enables jobs to do this without directly talking to Redis.

## Static Bundles

Using Compoxure in conjunction with Bosco gives you a way to manage the static assets (JS, CSS, Images) that go with the services.

```
<script cx-bundles='service-one/main.js,service-two/app.js'/>
```

This in the background will turn this into a set of cx-url includes, based on the structure that Bosco uses to publish static assets (both in CDN mode and pushed to S3):

```
<script cx-bundles='{{cdn:url}}/{{environment:name}}/{{static:service-one}}/html/main.js.html'/>
<script cx-bundles='{{cdn:url}}/{{environment:name}}/{{static:service-two}}/html/app.js.html'/>
```

The most important of the variables in the above urls are the '{{static:service-one}}', which would resolve to: ```service-one/81``` (the service name and build number).

This works in the following way:

 * Service One (which is likely included somewhere in the page given it's static assets are), should respond to Compoxure with its content, and in addition, supply an additional header:  cx-static|service-one|main: 101
 * This represents the build number for the service, that is also then applied to all of the bundles with the same name.
 * If no header is supplied by the service, it will revert to 'default'.
 * If you include https://github.com/tes/bundle-version middleware this can all be handled for you.

If config.minified is true and you set the attribute "cx-server-push", this resource is added as a "hint" in the http header "link". Using this syntax:
```
link: </assets/jquery.js>; rel=preload
```
This suggest the browser to preload the resource as soon as possible (http://caniuse.com/#search=preload). It can be also used by HTTP2 compatible CDN for enabling the http2 server push feature (https://docs.fastly.com/guides/performance-tuning/http2-server-push).

A bundle is imported only once, any duplicated will be ignored.

### Common errors with including bundles

#### 1.  You are including a bundle for a service but not including a fragment for the service in the page.

Compoxure is able to convert `service-one/main.js` into an actual full, versioned, CDN based url only if there is a fragment from that service included in the page.  This is because it is only the service itself that knows which version of itself is deployed, and it responds with the bundle name and version in the headers of the response it makes to compoxure.  This information is cached in the context of the response, and used to generate the full bundle URLs.

TL;DR - if you want to use a bundle from `service-a` you *must* be including a fragment (via `cx-url`) in the same page.  If you aren't for any reason, you can create a dummy endpoint - e.g. something that returns an empty string or comment, and request that in the page to ensure that the version for the bundles are available.

#### 2.  You are including a bundle that doesn't exist from a service (e.g. isn't exported in the bosco-service.json).

Similar to above, you must use the correct bundle name as exported in the services bosco-service.json.  It is case sensitive.

## Libraries

If you want to copy common libraries up to your CDN (e.g. via Bosco), but have the versioning managed by those libraries, there is a directive for that.

```
<script async="true" cx-library='bootstrap-0.3.0/bootstrap-0.3.0.js'></script>
<link cx-library='bootstrap-0.3.0/bootstrap-0.3.0.css' media="all" rel="stylesheet"/>
```

This will resolve the `src` or `href` properties to:

```
{{cdn:url}}/{{environment:name}}/vendor/library/{{library}}
```

e.g.

```
https://duqxiy1o2cbw6.cloudfront.net/tes/vendor/library/bootstrap-3.2.0.min.css
```
A library is imported only once, any duplicated will be ignored.

## Client hints
You can apply the cx-client-hint=true attribute to a cx-library, cx-bundle or cx-src tag. This transforms the tag in a client hint:
```
<link rel="preload" src="script.js" as="script" />
```
By default rel="preload" is used, unless you specify a rel attribute with a different value.

## Images

In addition to bundles, you can use a directive to get access to images from a service that also respect the service version and cdn url.

```
<img cx-src='service-one/image.png' />
```

This would resolve to:

```
<script src='{{cdn:url}}/{{environment:name}}/{{static:service-one}}/img/image.png'/>
```

## 404 Responses from Microservices

If any of the requests to a backend service via cx-url return a 404, then compoxure itself will render a 404 back to the client.  At TES we have nginx capture the 404 and return a static 404 page.   This can be turned off on an include by include basis by adding the 'cx-ignore-404' attribute.

## Cache-Control header on Responses from Microservices

If a request to a backend service via cx-url returns a response with Cache-Control header set to `no-store` or `no-cache`, this directive takes priority over any otherwise configured caching, and the response doesn't get cached. Compoxure also copies this header onto the response to the client as `no-cache, no-store, must-revalidate`. This can be overridden by the backend by using `passThroughHeaders:["cache-control"]"`. This is in effect a form of cache busting from microservice.

If a microservice responds with Cache-Control header with a max-age value, then this value takes priority over other caching config and response is cached for max-age time. Header is not copied to client response in this case

## Settings Time Intervals

Compoxure uses a number of time intervals for timeouts and TTLS. To make this simpler, there is a simple library that can convert basic string based intervals into ms.

e.g. 1s = 1000, 1m = 60*1000 etc.  The valid values are 1s, 1m, 1h, 1d.  If you do not provide a suffix it assumes ms.

## Debug mode
Adding the query string parameter ```?cx-debug=true``` will cause compoxure to append a collection of debug information regarding fragments collected in the page.
In the example app it produces:
```
200 : 3ms : http://localhost:5001/include.html
200 : 12ms : http://localhost:5001/dynamic
200 : 12ms : http://localhost:5001/dynamic
200 : 114ms : http://localhost:5001/faulty
200 : 1ms : http://localhost:5001/cdn/service/YOU_SPECIFIED_A_BUNDLE_THAT_ISNT_AVAILABLE_TO_THIS_PAGE/html/bottom.js.html
200 : 1ms : http://localhost:5001/cdn/service/100/html/top.js.html
```

## View the page without caching
Adding the query string parameter ```?cx-no-cache=true``` will force compoxure not to use cache.

## Statistics

You can add a statisticsHandler to the config functions to allow the underlying parsing engine to provide statistics back to you on each render:

```js
  'statisticsHandler': function(backend, statistics) {
      // Store the statistics somewhere for the backend
  }
```

An example of the statistics for an example page, showing stats about fragments and bundles rendered:


```json
{
  "fragments": {
    "http://localhost:5001/include.html": {
      "attribs": {
        "cx-url": "http://localhost:5001/include.html",
        "cx-cache-key": "shakespeare",
        "cx-cache-ttl": "10s",
        "class": "block",
        "cx-url-raw": "{{server:local}}/include.html",
        "cx-cache-key-raw": "shakespeare"
      }
    },
    "http://localhost:5001/dynamic": {
      "attribs": {
        "id": "testnocache",
        "cx-url": "http://localhost:5001/dynamic",
        "cx-cache-key": "dynamicnocache",
        "cx-cache-ttl": "10s",
        "cx-no-cache": "",
        "class": "block",
        "cx-url-raw": "{{server:local}}/dynamic",
        "cx-cache-key-raw": "dynamicnocache",
        "cx-no-cache-raw": "{{#query:nocache}}true{{/query:nocache}}"
      }
    },
    "http://localhost:5001/500": {
      "attribs": {
        "cx-url": "http://localhost:5001/500",
        "cx-cache-key": "500",
        "cx-cache-ttl": "10s",
        "class": "block",
        "cx-url-raw": "{{server:local}}/500",
        "cx-cache-key-raw": "500"
      }
    },
    "http://localhost:5001/faulty": {
      "attribs": {
        "cx-url": "http://localhost:5001/faulty",
        "cx-cache-key": "faulty-nocache",
        "cx-cache-ttl": "0",
        "cx-timeout": "1s",
        "class": "block",
        "cx-url-raw": "{{server:local}}/faulty",
        "cx-cache-key-raw": "faulty-nocache"
      }
    },
    "http://localhost:5001/slow": {
      "attribs": {
        "cx-url": "http://localhost:5001/slow",
        "cx-cache-key": "slowservice",
        "cx-cache-ttl": "10s",
        "cx-timeout": "20",
        "class": "block",
        "cx-url-raw": "{{server:local}}/slow",
        "cx-cache-key-raw": "slowservice"
      }
    }
  },
  "bundles": {
    "service|bottom": {
      "service": "service",
      "name": "bottom.js"
    },
    "service|top": {
      "service": "service",
      "name": "top.js"
    }
  }
}
```

## CMS Integration

We have now added a feature that allows you to retrieve and then inject content from a CMS into any page served via compoxure.

You need to have your CMS expose a simple endpoint that allows you to retrieve a batch of content based on a lookup key (e.g. a page name).  The batch is important, to ensure it only makes one very cacheable request for content.

```{{cms-base-url}}/{{context}}```

You configure the base url in the configuration, adding:

```json
"content": {
  "server": "http://my-cms.tes.com/content/compoxure"
}
```

You can then add a tag to your page (it can be anywhere, we put it in the head:

```html
<meta cx-content="home" cx-cache-key="content:home" cx-cache-ttl="30m" />
```

This then makes a request to the following url: ```http://my-cms.tes.com/content/compoxure/home```.  The `cx-cache-key` and `cx-cache-ttl` parameters are optional, they will get set to sensible defaults (the URL and 5m).

Your CMS needs to respond to the GET request with a simple `key: content` map.

```json
{
"h1": "This is some CMS managed header text",
"home_news": "<h3> </h3>\n<h3><a href=\"https://www.tes.com/news\">News</a></h3>\n<p>Get the latest school news - and views - from the trusted home of education journalism</p>\n"
}
```

This content map is then stored for the context of the request, and you can inject the content anywhere in the page:

```html
<h1 cx-content-item="{{content:h1}}">Default Header</h1>
```

If the CMS request fails, and your back end is configured to fail quietly then it will render the default text.

If you need to dump HTML, remember to use the `{{{content:h1}}}` syntax.

## Alternatives / Rationale

We built compoxure because it solved a set of problems that alternative solutions didn't quite reach.

### Ajax

In single page apps you can easily use client side javascript to build a single application based on top of multiple underlying microservices.  However, this doesn't work when you need to deliver a typical content heavy website where SEO is important - e.g. you have a mixture of content and app.  We need to deliver a page, and then progressively enhance it via javascript.  We use Ajax, just not for the initial hit.

### iFrames

You can use iFrames to compose applications together, even across multiple domains.  However this does introduce a latency in the page rendering for the user, and also makes it challenging to have the components interact with each other (it is possible if you invest in postMessage etc).  iFrames do not work in the case of SEO heavy pages.   (Credit to [Dejan Glozic](http://dejanglozic.com/) for reminding me of this option).

### Server Side Includes

Server side includes (e.g. in nginx) can pull together outputs from services into a single response, and it also can enable some level of caching of both the response and each fragment.  However, it can be quite challenging to setup and the final solution doesn't allow programmatic interaction with the cache or fine grained control over the cache keys (e.g. based on cookie, url params, query params or header values).

See: http://syshero.org/post/50498184831/simulate-basic-esi-using-nginx-and-ssi

### Edge Side Includes

Edge side includes (e.g. in Varnish or Akamai) are an enhanced version of SSI, and Akamai in particular has a full implementation of the entire ESI language.  This is however very proprietary and locks you into Akamai, there are also restrictions on the number of ESI includes on a single page.  The ESI language itself is quiet dated and pollutes your pages with pseudo XML markup.

See: http://blog.lavoie.sl/2013/08/varnish-esi-and-cookies.html

### 'Front End' server

The final option is to simply build a service that's purpose in life is aggregating backend services together into pages programmatically.  e.g. a controller that calls out to a number of services and passes their combined responses into a view layer in a traditional web app.  The problem with this approach is this server now becomes a single monolithic impediment to fast release cycles, and each of the service wrappers in the front end app will now need to implement circuit breaker and other patterns to ensure this app doesn't die, taking down all of the pages and services it fronts, when any of the underlying servics die.

### Debugging compoxure parsing

To test the parsing functionality using the browser extension:
- configuration should have `enableExtension = true`
- POST the template string with `Content-Type: text/compoxure`
