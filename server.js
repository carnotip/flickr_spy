var sys = require("sys"), 
  http = require("http"),
  posix = require("posix"),
  flickr = require("./vendor/flickr/lib/flickr").flickr,
  underscore = require("./vendor/underscore/underscore"),
  throttle = require("./vendor/throttle/lib/throttle"),
  username = process.ARGV[2] || "ncr";

sys.puts("* Flickr Spy: " + username);

http.createServer(function (req, res) {
  var path = req.uri.path
  sys.puts(path)
  //sys.puts(sys.inspect(req.headers))
  if (path == "/") {
    posix.cat("public/index.html").addCallback(function (data) {
      res.sendHeader(200, {'Content-Type': 'text/html'});
      res.sendBody(data);
      res.finish();
    });
  } else if (path.match(/^\/promise/)) {
    res.sendHeader(200, {'Content-Type': 'text/plain'});
    spy_promise("ncr").addCallback(function (data) {
      res.sendBody(JSON.stringify(data) + "\n");
      res.finish();
    }).addErrback(function (data) {
      res.sendBody(JSON.stringify(data) + "\n");
      res.finish();
    });
  } else if (path.match(/^\/emitter/)) {
    res.sendHeader(200, {'Content-Type': 'text/plain'});
    spy_emitter("ncr").addListener("data", function (data) {
      res.sendBody(JSON.stringify(data) + "\n");
    }).addListener("close", function () {
      res.finish();
    });
  } else {
    posix.cat("public" + path, "binary").addCallback(function (data) {
      var headers = {};

      if(path.match(/\.js$/)) {
        headers['Content-Type'] = 'application/javascript';
        headers['Content-Length'] = data.length;
        res.sendHeader(200, headers);
        res.sendBody(data);
        res.finish();
      } else if(path.match(/\.swf$/)) {
        headers['Content-Type'] = 'application/x-shockwave-flash';
        headers['Content-Length'] = data.length;
        res.sendHeader(200, headers);
        res.sendBody(data, "binary");
        res.finish();
      } else {
        lol(); // flunk
      }
    }).addErrback(function () {
      posix.cat("public/404.html").addCallback(function (data) {
        res.sendHeader(404, {'Content-Type': 'text/html'});
        res.sendBody(data);
        res.finish();
      });
    });
  }
}).listen(3000);

var spy_emitter = function (username) {
  var emitter = new process.EventEmitter(),
    url = "http://flickr.com/photos/" + username;
  
  flickr.rest.urls.lookupUser(url).addCallback(function (user_id) {
    
    flickr.rest.contacts.getPublicList(user_id).addCallback(function (user_ids) {
      var contact_ids = user_ids,
        t1 = throttle.create(3),
        todo1 = user_ids.length, done1 = 0,
        todo2 = 0, done2 = 0;
      
      user_ids.forEach(function (user_id) {
        t1.run(function () {
          
          flickr.feeds.photosComments(user_id).addCallback(function (photo_urls) {
            var t2 = throttle.create(3);
            done1++;
            todo2 += photo_urls.length;
            
            var finalize = function() {
              done2++;
              if (todo1 == done1 && todo2 == done2) {
                sys.debug("callback: getList: close")
                emitter.emit("close");
              }
              t2.free();
            };

            photo_urls.forEach(function (photo_url) {
              t2.run(function () {
                var photo_id = photo_url.match(/(\d+$)/)[1];
                
                /*
                flickr.photos.getInfo(photo_id).addCallback(function (photo) {
                  
                }).addErrback(function (data) {
                  sys.debug("errback: geInfo: " + data);
                });
                */
                
                flickr.rest.photos.comments.getList(photo_id).addCallback(function (user_ids) {
                  sys.debug("callback: getList: data")
                  emitter.emit("data", [photo_url, _.intersect(contact_ids, user_ids)]);
                  finalize();
                }).addErrback(function (data) {
                  // do not emit error from this loop
                  sys.debug("errback: getList: " + data);
                  finalize();
                });
                
              });
            });
            
            t1.free();
          }).addErrback(function (data) {
            emitter.emit("error");
            sys.debug("errback: photosComments: " + data);
          });
        });
      });
      
    }).addErrback(function (data) {
      emitter.emit("error");
      sys.debug("errback: getPublicList: " + data);
    });
    
  }).addErrback(function (data) {
    emitter.emit("error");
    sys.debug("errback: lookupUser: " + data);
  });
  return emitter;
};

var spy_promise = function (username) {
  var promise = new process.Promise();
  var result = [];
  spy_emitter(username).addListener("data", function (data) {
    result.push(data);
  }).addListener("close", function () {
    promise.emitSuccess(result);
  }).addListener("error", function (data) {
    promise.emitError(data);
  })
  return promise;
}

