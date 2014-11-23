'use strict';

var expect = require('expect.js');
var async = require('async');
var request = require('request');
var _ = require('lodash');
var http = require('http');
var cheerio = require('cheerio');
var config = require('../common/testConfig.json');
var stubServer = require('../common/stubServer');
var pcServer = require('../common/pcServer');

describe("Page Composer", function(){

    var pageComposer;

    this.timeout(5000);
    this.slow(3000);

    before(function(done){
        async.series([
            initStubServer,
            initPageComposer
        ], done);
    });

    function createEventHandler() {
        return {
            logger: function(level, message, data) {
            },
            stats: function(type, key, value) {
            }
        }
    }

    function initStubServer(next) {
        stubServer.init('pageComposerTest.html', 5001,'localhost')(next);
    }

    function initPageComposer(next) {
        pcServer.init(5000, 'localhost', createEventHandler())(next);
    }

    function getPageComposerUrl(path, search) {

        var url = require('url').format({
            protocol: 'http',
            hostname: 'localhost',
            port: 5000,
            pathname: path,
            search: search
        });

        return url;
    }

    it('should silently drop favicon requests', function(done) {
        request.get(getPageComposerUrl('favicon.ico'),{headers: {'accept': 'image/x-icon'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            done();
        });
    });

    it('should ignore requests for anything other than html', function(done) {
        request.get(getPageComposerUrl(),{headers: {'accept': 'text/plain'}}, function(err, response) {
            expect(response.statusCode).to.be(415);
            done();
        });
    });

    it('should process requests for any content type (thanks ie8)', function(done) {
        request.get(getPageComposerUrl(), {headers: {'accept': '*/*'}}, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            expect($('#declarative').text()).to.be.equal('Replaced');
            done();
        });
    });

    it('should not die if given a poisoned url', function(done) {
        var targetUrl = getPageComposerUrl() + '?cid=271014_Primary-103466_email_et_27102014_%%%3dRedirectTo(%40RESOURCEURL1)%3d%%&mid=_&rid=%%External_ID%%&utm_source=ET&utm_medium=email&utm_term=27102014&utm_content=_&utm_campaign=271014_Primary_103466_%%%3dRedirectTo(%40RESOURCEURL1)%3d%%';
        request.get(targetUrl, {headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            done();
        });
    });

    it('should return a 404 if any of the fragments return a 404', function(done) {
        var requestUrl = getPageComposerUrl('404backend');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(404);
            done();
        });
    });

    it('should not return a 404 if of the fragments return a 404', function(done) {
        var requestUrl = getPageComposerUrl('ignore404backend');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            done();
        });
    });

    it('should return a 404 if the backend template returns a 404', function(done) {
        var requestUrl = getPageComposerUrl('404');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(404);
            done();
        });
    });

    it('should return a 500 if the backend template returns a 500', function(done) {
        var requestUrl = getPageComposerUrl('500');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(500);
            done();
        });
    });

    it('should return a 500 if the backend template returns no response at all', function(done) {
        var requestUrl = getPageComposerUrl('broken');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(500);
            done();
        });
    });

    it('should add no-store cache-control header if any fragments use cx-no-cache', function(done) {
        var requestUrl = getPageComposerUrl('noCacheBackend');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.headers['cache-control']).to.be.equal('no-store');
            done();
        });
    });

    it('should fail quietly if the backend is configured to do so', function(done) {
        var requestUrl = getPageComposerUrl('quiet');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#faulty').text()).to.be.equal('Faulty service');
            done();
        });
    });

    it('should fail loudly if the backend is configured to do so', function(done) {
        var requestUrl = getPageComposerUrl();
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#faulty').text()).to.be.equal('Error: Service http://localhost:5001/500 FAILED due to status code 500');
            done();
        });
    });

    it('should leave the content that was originally in the element if it is configured to do so', function(done) {
        var requestUrl = getPageComposerUrl('leave');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#faulty').text()).to.be.equal('Faulty service');
            done();
        });
    });

    it('should fail gracefully if the service returns no response at all', function(done) {
        getSection('', '', '#broken', function(text) {
            expect(text).to.be.equal('Error: Service http://localhost:5001/broken FAILED due to socket hang up');
            done();
        });
    });

    it('should remove the element if cx-replace-outer is set', function(done) {
        request.get(getPageComposerUrl(), {headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#replace-outer-content').length).to.be.equal(0);
            expect($('#replace-outer').text()).to.be.equal('wrapping Replaced content');
            done();
        });
    });

    it('should ignore a cx-url that is invalid', function(done) {
        getSection('', '', '#invalidurl', function(text) {
            expect(text).to.be.equal('Error: Service invalid FAILED due to Invalid URL invalid');
            done();
        });
    });

    it('should ignore a cx-url that is invalid unless it is cache', function(done) {
        getSection('', '', '#cacheurl1', function(text) {
            expect(text).to.be.equal('No content in cache at key: cache');
            done();
        });
    });

    it('should ignore a cx-url that is invalid unless it is cache, and get the content if cache is primed', function(done) {
        getSection('', '', '#cacheurl2', function(text) {
            expect(text).to.be.equal('Replaced');
            done();
        });
    });

     it('should allow simple mustache logic', function(done) {
        getSection('', '?logic=yes', '#testlogic', function(text) {
            expect(text).to.be.equal('Logic ftw!');
            done();
        });
    });

    it('should have access to current environment', function(done) {
        getSection('', '', '#environment', function(text) {
            expect(text).to.be.equal('test');
            done();
        });
    });

    it('should not cache segments that return no-store in Cache-control header', function(done) {
        getSection('', '', '#no-store', function(text) {
            var before = text;
            setTimeout(function() {
                getSection('', '', '#no-store', function(text) {
                    expect(text).not.to.be.equal(before);
                    done();
                });
            }, 1);
        });
    });

    it('should pass no-store in Cache-control header from fragment response to client response', function(done) {
        request.get(getPageComposerUrl(), function(err, response) {
            expect(response.headers['cache-control']).to.be.equal('no-store');
            done();
        });
    });

    it('should honor max-age when sent through in fragments', function(done) {
        setTimeout(function() {
            getSection('', '', '#max-age', function(text) {
                setTimeout(function() {
                    getSection('', '', '#max-age', function(text2) {
                        expect(text2).to.be.equal(text);
                        setTimeout(function() {
                            getSection('', '', '#max-age', function(text3) {
                                expect(text3).not.to.be.equal(text);
                                done();
                            });
                        }, 1000);
                    });
                }, 50);
            });
        }, 1000); // Allow previous test cache to clear
    });

    it('should pass through non GET requests directly to the backend service along with headers and cookies', function(done) {
        var j = request.jar();
        var cookie = request.cookie('PostCookie=Hello');
        j.setCookie(cookie, getPageComposerUrl(),function() {
            request.post(getPageComposerUrl('post'), { jar: j, headers: {'accept': 'text/html'} }, function(err, response, content) {
                expect(content).to.be("POST Hello");
                done();
            });
        });
    });

    it('should NOT pass through GET requests that have text/html content type to a backend service', function(done) {
        request.get(getPageComposerUrl('post'), { headers: {'accept': 'text/html'} }, function(err, response, content) {
            expect(content).to.be("GET /post");
            done();
        });
    });

    it('should select the correct backend if a selectorFn is invoked', function(done) {
        request.get(getPageComposerUrl() + '?selectFn=true', {headers: {'accept': 'text/html'}}, function(err, response, content) {
            var $ = cheerio.load(content);
            expect($('#select').text()).to.be.equal("This is the backend selected by a selector fn");
            done();
        });
    });

    it('should use the handler functions to respond to a 403 status code', function(done) {
        request.get(getPageComposerUrl('403backend'), {headers: {'accept': 'text/html'}}, function(err, response, content) {
            expect(response.statusCode).to.be.equal(403);
            done();
        });
    });

    it('should pass x-tracer to downstreams', function(done) {
        var requestUrl = getPageComposerUrl('tracer');
        request.get(requestUrl,{headers: {'accept': 'text/html', 'x-tracer': 'willie wonka'}}, function(err, response) {
            expect(response.body).to.be('willie wonka');
            done();
        });
    });

    it('should retrieve bundles via the cx-bundle directive and cdn configuration using service supplied version numbers if appropriate', function(done) {
        var requestUrl = getPageComposerUrl('bundles');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            var $ = cheerio.load(response.body);
            var bundles = $('.bundle');
            expect($(bundles[0]).text()).to.be('100 >> service-one-top.js.html');
            expect($(bundles[1]).text()).to.be('default >> service-two-top.js.html');
            done();
        });
    });

    it('should use the target url to extract a default host if none provided in the backend config', function(done) {
        var requestUrl = getPageComposerUrl('nohost');
        request.get(requestUrl,{headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            expect(response.body).to.be('localhost');
            done();
        });
    });

    it('should not completely die with broken cookies', function(done) {
        var brokenCookie = "__gads=ID=5217e5ce98e5a5f6:T=1413059056:S=ALNI_MZDmTo6sr27tzMt9RUR65K4xSUWzw; s_fid=79BC0100183D81BE-2708D64605382DEA; TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66; TESCookie=XynqF84fIQqO6TMaKPbxsVTGdTQ48cl3KrcYfm0DYZX6eVdcjL9ySX0YHGtk4pqaIJG7TqCiS0%2b6J0bUJgfQR2B7b4AfikEDSl6lrxOdFL9jZQ0vNZuHz9f3Gzr%2f5wu6FSvssSUjGS1paLLxB1UH0idMUHD6RqydZQDVxWpo0BeYg6ZsuSv9XeksslbTqs7FbMetUqSC0JwIRkXsFb6tve7YkunuEg%2fYvrW%2fcsNb1p%2bHXQTWXCKFEa10PMCpXo%2fNw5fV5ofp4svALCnLWUlpO4TDMopHrADRfS3FezOIgQWqES2VQQGBD8lRYWn7ijS%2bUxTzYWBF1b1NWAlGbRORyOAUaq7uS0zvlQ6VuHPca98%3d; TESCookieUser=4241009; tp_ex=0; s_campaign=031114_Secondary-124726_email_et_3112014_%25%25%3DRedirectTo%28%40TOPTENURL7%29%3D%25%25; ET:recipientid=%25%25External_ID%25%25; ET:messageid=_; .TesApplication=9DA9A85E2E258EE23C0537C87F7D4F0DDD37CB5FDDFB44DD230E5CC584B58586EA35644839CA7F75DF6EC079ECFE5B99BE7C3E36EE93A651BA365EE935D7A16EE08793AB021FC95537FD5079CD75BB56EE5A2D438CB8B2F47C3AA3C4EE0C9B2DBE361889F1DD75E0D2F967193449D61191A2F75BEF3D2608CC75620EAE313938BA52495555F785ED8B8FA393FC84D7360D19507576B1BDB0A999B31835360C84B8F023AED31CCA8910BC13FDEF3476006C9FD16C11FBC133E67F1EC958332DF86447EDEFDC3AD59EDC4CB183B49D1F081AC586178FD3D2BCD9BDB16E561F70BD94E73EE404024542DD2DAFA317DCD5B310A79ABC441B01B44A8E3D5FFE922BE389AE91E41FDCB5F2A4FFBC6994812E769BC657007A26414CC2BD7EE68AC3EDD630D076B28048B428ECF42598DEDE9427CA3CAA856CDD46ACE57B85E8846A8674E37D75BCB29ABAAEB227F8EE6C996D994E0B06DF; __utmt_UA-13200995-3=1; s_cc=true; s_sq=%5B%5BB%5D%5D; __utma=233401627.2136099593.1404067931.1416513050.1416513139.14; __utmb=233401627.5.10.1416513139; __utmc=233401627; __utmz=233401627.1416513139.14.12.utmcsr=ET|utmccn=031114_Secondary_124726_%%=RedirectTo(@TOPTENURL7)=%%|utmcmd=email|utmctr=3112014|utmcct=_; __atuvc=0%7C43%2C0%7C44%2C7%7C45%2C0%7C46%2C3%7C47; __atuvs=546e4672cc74592b002";
        pcServer.init(5003, 'localhost', createEventHandler(), 'noWhitelist')(function() {
            var requestUrl = getPageComposerUrl();
            request.get('http://localhost:5003/', {headers: {'accept': 'text/html', 'cookie': _.clone(brokenCookie)}}, function(err, response) {
                expect(response.statusCode).to.be(200);
                var $ = cheerio.load(response.body);
                var cookieValue = $('#cookie').text();
                expect(cookieValue).to.be(brokenCookie);
                done();
            });
        });

    });

    it('should only allow cookies to pass through that are whitelisted', function(done) {
        var requestUrl = getPageComposerUrl();
        var j = request.jar();
        j.setCookie(request.cookie('CompoxureCookie=Test'), getPageComposerUrl());
        j.setCookie(request.cookie('AnotherCookie=Test'), getPageComposerUrl());
        j.setCookie(request.cookie('TSLCookie=Test'), getPageComposerUrl());
        request.get(requestUrl, {jar: j, headers: {'accept': 'text/html'}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            var $ = cheerio.load(response.body);
            var cookieValue = $('#cookie').text();
            expect(cookieValue).to.be('CompoxureCookie=Test; TSLCookie=Test');
            done();
        });
    });

    it('should be able to whitelist even with broken cookies', function(done) {
        var brokenCookie = "__gads=ID=5217e5ce98e5a5f6:T=1413059056:S=ALNI_MZDmTo6sr27tzMt9RUR65K4xSUWzw; s_fid=79BC0100183D81BE-2708D64605382DEA; TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66; TESCookie=XynqF84fIQqO6TMaKPbxsVTGdTQ48cl3KrcYfm0DYZX6eVdcjL9ySX0YHGtk4pqaIJG7TqCiS0%2b6J0bUJgfQR2B7b4AfikEDSl6lrxOdFL9jZQ0vNZuHz9f3Gzr%2f5wu6FSvssSUjGS1paLLxB1UH0idMUHD6RqydZQDVxWpo0BeYg6ZsuSv9XeksslbTqs7FbMetUqSC0JwIRkXsFb6tve7YkunuEg%2fYvrW%2fcsNb1p%2bHXQTWXCKFEa10PMCpXo%2fNw5fV5ofp4svALCnLWUlpO4TDMopHrADRfS3FezOIgQWqES2VQQGBD8lRYWn7ijS%2bUxTzYWBF1b1NWAlGbRORyOAUaq7uS0zvlQ6VuHPca98%3d; TESCookieUser=4241009; tp_ex=0; s_campaign=031114_Secondary-124726_email_et_3112014_%25%25%3DRedirectTo%28%40TOPTENURL7%29%3D%25%25; ET:recipientid=%25%25External_ID%25%25; ET:messageid=_; .TesApplication=9DA9A85E2E258EE23C0537C87F7D4F0DDD37CB5FDDFB44DD230E5CC584B58586EA35644839CA7F75DF6EC079ECFE5B99BE7C3E36EE93A651BA365EE935D7A16EE08793AB021FC95537FD5079CD75BB56EE5A2D438CB8B2F47C3AA3C4EE0C9B2DBE361889F1DD75E0D2F967193449D61191A2F75BEF3D2608CC75620EAE313938BA52495555F785ED8B8FA393FC84D7360D19507576B1BDB0A999B31835360C84B8F023AED31CCA8910BC13FDEF3476006C9FD16C11FBC133E67F1EC958332DF86447EDEFDC3AD59EDC4CB183B49D1F081AC586178FD3D2BCD9BDB16E561F70BD94E73EE404024542DD2DAFA317DCD5B310A79ABC441B01B44A8E3D5FFE922BE389AE91E41FDCB5F2A4FFBC6994812E769BC657007A26414CC2BD7EE68AC3EDD630D076B28048B428ECF42598DEDE9427CA3CAA856CDD46ACE57B85E8846A8674E37D75BCB29ABAAEB227F8EE6C996D994E0B06DF; __utmt_UA-13200995-3=1; s_cc=true; s_sq=%5B%5BB%5D%5D; __utma=233401627.2136099593.1404067931.1416513050.1416513139.14; __utmb=233401627.5.10.1416513139; __utmc=233401627; __utmz=233401627.1416513139.14.12.utmcsr=ET|utmccn=031114_Secondary_124726_%%=RedirectTo(@TOPTENURL7)=%%|utmcmd=email|utmctr=3112014|utmcct=_; __atuvc=0%7C43%2C0%7C44%2C7%7C45%2C0%7C46%2C3%7C47; __atuvs=546e4672cc74592b002";
        var tslCookie = "TSLCookie=585108831577993685E2ADCF228581BE11AD0DA8B9E378FB8C33DF9B01E21E48C8991D75B61F24E8D7CA2A6A04B2F64B67A6D53A6A375B00EEE705EEADB6ED3FBE04E19D385F5DC89793ADB6978BC6EC17D52A7ED4740D3266C3EDDFCAC2AD881762439AD0485C24B5511984A9D21387921B85193D2689CF6A9B3CCA8CEA4E8939D187CC7327ABC47111A1840C251B1C49DB823713CB866BE0D9958BAAD8CF06D05762525DAD7741272E479BC07CA3D2B35DA1EC2FF8C9284C2996811D4E704573AF8A9E1D4BE609B50A6AC5B29FDC31DCA8460164A44EAB83B730BE565DCC7470EA6C66";
        var requestUrl = getPageComposerUrl();
        request.get(requestUrl, {headers: {'accept': 'text/html', 'cookie': _.clone(brokenCookie)}}, function(err, response) {
            expect(response.statusCode).to.be(200);
            var $ = cheerio.load(response.body);
            var cookieValue = $('#cookie').text();
            expect(cookieValue).to.be(tslCookie);
            done();
        });

    });

    it('should create a default handler if none provided', function(done) {
        pcServer.init(5002, 'localhost')(function() {
            done();
        });
    });

    function getSection(path, search, query, next) {
        var url = getPageComposerUrl(path, search);
        request.get(url,{headers: {'accept': 'text/html'}}, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            next($(query).text());
        });
    }

    function getSectionAuth(query, userId, next) {
        var j = request.jar();
        var cookie = request.cookie('TSLCookie=' + userId);
        j.setCookie(cookie, getPageComposerUrl());
        request.get(getPageComposerUrl(), { jar: j, headers: {'accept': 'text/html'} }, function(err, response, content) {
            expect(err).to.be(null);
            var $ = cheerio.load(content);
            next($(query).text());
        });
    }
});
