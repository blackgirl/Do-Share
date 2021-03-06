
var mem = {};
var touch = {};
var needRefresh = false;
var gpe;
var title_gpe;
var audienceChooser;
var pollManager;
var linked = {};
var circlesNotify = {};
var activeXhr;

var postsCurrentlyDisplayed = [];

var currentMedias;

var lastUpdate = 0;

var identities = [];

function refreshIdentities() {
  identities = chrome.extension.getBackgroundPage().identities;
  if (!identities) {
    identities = [];
  }
  window.setTimeout(refreshIdentities, identities.length ? 5000 : 250);
}

var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-27041781-6']);
_gaq.push(['_trackPageview']);

function trackSchedule(post) {
  if (post.timeStamp) {
     _gaq.push(['_trackEvent', 'Schedule', 'future', 'future', Math.floor((post.timeStamp - new Date().getTime()) / 1000)]);
  }
}

function trackClick(buttonName) {
  _gaq.push(['_trackEvent', buttonName, 'Clicked']);
}

function val(name) {
  var $ = document.getElementById(name).value;
  return ($ ? $ : undefined);
}

function sendPost(post) {
  if (post.state == 'autosave') {
    post.state = document.querySelector('.scheduled #post' + post.writeTimeStamp) ? 'scheduled' : 'draft';
    chrome.extension.sendRequest({'type': 'post', 'post': post}, refreshPosts);
    $('#write_time_stamp').val(post.writeTimeStamp);
  } else {
    chrome.extension.sendRequest({'type': 'post', 'post': post}, refresh);
  }
}

function getEditedPost(state, writeTimeStamp) {
  var mentioned = (mem[writeTimeStamp] && mem[writeTimeStamp].mentioned) || {};
  for (var id in gpe._mentioned) {
    mentioned[id] = gpe._mentioned[id];
  }
  for (var id in title_gpe._mentioned) {
    mentioned[id] = title_gpe._mentioned[id];
  }
  var circlesNotifyArray = [];
  for (var key in circlesNotify) {
    circlesNotifyArray.push(key);
  }
  var shareAsId = val('share_as_id');
  var shareAs;
  if (shareAsId) {
    shareAs = {
      id: shareAsId,
      name: val('share_as_name'),
      image: val('share_as_image')
    };
  }

  var pollOptions = {};
  if (pollManager && pollManager.isActive()) {
    pollOptions.isActive = true;
    pollOptions.options = pollManager.getOptions();
  }

  return {
    'state': state,
    'content': getContent(gpe) || '',
    'share_id': val('share_id'),
    'reshare': (mem[writeTimeStamp] && mem[writeTimeStamp].reshare) || undefined,
    'image_id': val('image_id'),
    'title': getContent(title_gpe),
    'entities': audienceChooser.getEntities(),
    'timeStamp': new Date(Number(val('time'))).getTime() || undefined,
    'link': val('link') || undefined,
    'touch': new Date().getTime(),
    'mentioned': mentioned,
    'medias': currentMedias,
    'circlesNotify': circlesNotify,
    'circlesNotifyArray': circlesNotifyArray,
    'shareAs': shareAs,
    'pollOptions': pollOptions
  };
}

function isEmptyPost(post) {
  for (var key in post) {
    if (key == 'mentioned') {
      continue;
    }
    if (key == 'entities' && post[key]) {
      // If the user entered only a few items, consider the post empty.
      if (post[key].length > 3) {
        return false;
      }
    } else if (key == 'content' && post[key] == '_(Shared using #DoShare)_') {
      continue;
    } else if (key == 'pollOptions') {
       if (post[key].isActive) {
        return false;
      }
      continue;
    } else if (post[key] && key != 'touch' && key != 'notify' && key != 'circlesNotify' && key != 'circlesNotifyArray') {
      return false;
    }
  }
  return true;
}

function post(state) {
  var writeTimeStamp = Number(val('write_time_stamp') || 0);
  var post = getEditedPost(state, writeTimeStamp);
  if (writeTimeStamp) {
    post.writeTimeStamp = writeTimeStamp;
    var savedPost = mem[writeTimeStamp];
    if (savedPost) {
      post.reshare = savedPost.reshare;
    }
  } else {
    post.writeTimeStamp = new Date().getTime();
  }
  sendPost(post);
  if (state == 'scheduled') {
    trackSchedule(post);
  }
  if (state != 'autosave') {
    blinkPost(writeTimeStamp);
    if (!post.shareAs) {
      localStorage['lastUsedCircles'] = JSON.stringify(post.entities.filter(function(entity) {
        // Save only circles.
        return !!entity.circleId;
      }));
    }
  }
}

function blinkPost(writeTimeStamp) {
  var post = $('#post' + writeTimeStamp);
  post.addClass('activity');
  window.setTimeout(function(){post.removeClass('activity')}, 400);
}

function delPost() {
  var writeTimeStamp = Number(val('write_time_stamp'));
  if (document.getElementById('post' + writeTimeStamp)) {
    chrome.extension.sendRequest({'type': 'delPost', 'writeTimeStamp': writeTimeStamp}, refresh);
  } else {
    refresh();
  }
}

function getDateString(post) {
  if (post.state == 'scheduled') {
    return moment(post.timeStamp).format('dddd, MMMM Do YYYY [at] H:mm');
  } else {
    return '';
  }
}

function getContent(gpe) {
  return gpe && gpe.getText();
}

function profileAutocompleter(prefix, callback) {
  chrome.extension.sendRequest({type: 'profileAutocomplete', prefix: prefix}, callback);
}

function hashtagAutocompleter(prefix, callback) {
  chrome.extension.sendRequest({type: 'hashtagAutocomplete', prefix: prefix}, callback);
}

function populateTimeFields(timeStamp) {
  if (timeStamp) {
    function f(t) {
      if (String(t).length == 1) {
        return '0' + t;
      } else {
        return String(t);
      }
    }
    $('#time').val(timeStamp);
    var d = new Date(timeStamp);
    $('#dateTimeInput').val(f(d.getMonth() + 1) + '/' + f(d.getDate()) + '/' + d.getFullYear() + ' ' + f(d.getHours()) + ':' + f(d.getMinutes()) + (d.getSeconds() ? ':' + f(d.getSeconds()) : ''));
  } else {
    $('#dateTimeInput').val('');
    $('#timeInput').val('');
    $('#time').val('');
  }
}

function addDraftEditBox(post) {
  if (!post) {
    post = {};
    var lastUsed = localStorage['lastUsedCircles'];
    if (lastUsed) {
      post.entities = JSON.parse(lastUsed);
    } else {
      post.entities = [];
    }
  }
  var writeTimeStamp = post.writeTimeStamp || '';
  var content = post.content;
  if (!content && content != '') {
    content = (Settings.get('promoText') == 'all') ? '\n\n_(Shared using #DoShare)_' : '';
  }
  var share_id = post.share_id || '';
  var link = (!post.reshare && post.link) || '';
  var image_id = post.image_id || '';
  var title = post.title || '';
  var timeStamp = post.timeStamp;
  var entities = post.entities || [];
  var mentioned = post.mentioned || {};
  var pollOptions = post.pollOptions || {};
  var medias = post.medias;
  if (medias) {
    link = medias.link && medias.link.url || '';
  }
  currentMedias = medias;
  circlesNotify = post.circlesNotify || {};
  var shareAs = post.shareAs || {id: '', name: '', image: ''};

  if (gpe) {
    gpe.destroy();
  }
  if (title_gpe) {
    title_gpe.destroy();
  }
  if (activeXhr) {
    activeXhr.abort();
    activeXhr = undefined;
  }
  if (pollManager) {
    pollManager.destroy();
  }
  function onMention(details) {
    audienceChooser.addEntity({
      personId: details.id,
      name: details.name
    })
  };

  gpe = new GPEditor(document.getElementById('content'),
      content, writeTimeStamp, profileAutocompleter, mentioned, false, onMention, hashtagAutocompleter);
  title_gpe = new GPEditor(document.getElementById('title'),
      title, 'Title', profileAutocompleter, mentioned, true, onMention, hashtagAutocompleter);
  function onchange(e) {
    if (title_gpe.getText()) {
      $('#titlePlaceholder').hide();
    } else {
      $('#titlePlaceholder').show().css({display: ''});
    }
  };

  pollManager = new PollManager();
  if (pollOptions.isActive && pollOptions.options) {
    pollManager.fromSaved(pollOptions.options);
  }

  var t = document.getElementById('title');
  t.addEventListener('DOMCharacterDataModified', onchange);
  t.addEventListener('keyup', onchange);
  t.addEventListener('keydown', onchange);
  t.addEventListener('mouseup', onchange);
  t.addEventListener('mousedown', function() {
    window.setTimeout(onchange, 1);
  });
  onchange();
  t.onkeydown = function(e) {
    // Prevent ctrl-B
    if (e.keyCode == 66 && e.ctrlKey) {
      e.preventDefault();
    }
  }

  $('#share_id').val(share_id);
  $('#link, #linkInput').val(link);
  $('#image_id').val(image_id);
  $('#write_time_stamp').val(writeTimeStamp);
  $('#share_as_id').val(shareAs.id);
  $('#share_as_name').val(shareAs.name);
  $('#share_as_image').val(shareAs.image);

  populateTimeFields(timeStamp);

  audienceChooser = new AudienceChooser(entities);

  if (post.reshare) {
    $('#reshare').html(renderReshare(post));
    $('#postActions .postAction span').attr({'class': 'invalid'});
  } else {
    $('#reshare').html('');
    $('#postActions .postAction span').attr({'class': 'enabled'});
    populateEditorMediaArea(post.medias);
  }

  if (shareAs.id) {
    $('#addPhotoAction').attr({
      'class': 'disabled',
      'title': 'Do Share can\'t upload an image to a page\'s album'
    });
  } else {
    $('#share_as_id, #share_as_name, #share_as_image').val('');
    $('#addPhotoAction').attr({
      'class': 'enabled',
      'title': ''
    });
  }

  if (pollManager.isActive()) {
    $('#addPollAction').click();
  }

  var action = $('#postActions #postingAsAction');
  if (post.image_id) {
    action.attr({'class': 'disabled'});
  } else {
    action.attr({'class': 'enabled'});
  }

  if (link || post.reshare || post.medias) {
    $('#attachments').addClass('notempty');
  } else {
    $('#attachments').removeClass('notempty');
  }

  redrawIdentities();
}

function renderReshare(post) {
  if (!(post && post.reshare)) {
    return '';
  }
  var rs = post.reshare;
  return '<div class="reshare">' +
         '<div id="removeReshare"></div>' +
         '<h2>' + rs.author_name + ' originally shared this ' +
         '<a href="' + rs.url + '">post</a> ' +
         (rs.via_name ? ' (via ' + rs.via_name + ')' : '') +
         ':</h2>' +
         '<p>' + rs.content.replace(/(class=\'ot-hashtag\' href=\')/g, "$1https://plus.google.com/") + '</p>' +
         (rs.medias ? renderMediaItems(rs.medias) : '') + "</div>";
}

function renderReshareMeta(post) {
  if (!(post && post.reshare)) {
    return '';
  }
  var rs = post.reshare;
  return '<span class="reshareMeta">Reshared post by ' + rs.author_name + '</span>';
}

function editDraft(writeTimeStamp) {
  chrome.extension.sendRequest({type: 'fetchPost', writeTimeStamp: writeTimeStamp},
      function(post) {
    $('body').animate({scrollTop: 0}, 450);
    mem[post.writeTimeStamp] = post;
    addDraftEditBox(post);
    uncollapse();
  });
}

function bMinusA(a, b, key) {
  var aKeys = a.map(function(item){return item[key]});
  return b.filter(function(item) {
    return aKeys.indexOf(item[key]) == -1;
  });
}

function removeRemovedPosts(removedPosts) {
  removedPosts.forEach(function(post) {
    var p = $('#post' + post.writeTimeStamp);
    var interval = 1000;
    p.hide('blind', {}, interval);
    window.setTimeout(function() {
      p.remove();
    }, interval + 10);
  });
}

function getSavedPostMediaHtml(post) {
  function getMediaHtml(items) {
    var image = items.images[0];
    var video = items.video;
    if (video) {
      return "<iframe wmode='opaque' src='" + video.embed + "' width='260' ></iframe>";
    }
    if (image) {
      return "<img width='260' src='" + image.url + "' /" + ">";
    }
  };
  if (post.reshare && post.reshare.medias) {
    return getMediaHtml(post.reshare.medias);
  } else if (post.medias) {
    return getMediaHtml(post.medias);
  }
}

function renderAllPosts(posts) {
  if (!posts instanceof Array) {
    return;
  }
  var removedPosts = bMinusA(posts, postsCurrentlyDisplayed, 'writeTimeStamp');
  postsCurrentlyDisplayed = posts;
  removeRemovedPosts(removedPosts);
  posts.forEach(function(post) {
    renderPost(post);
  });
}

function renderPost(post) {
  if (post.touch && post.touch == touch[post.writeTimeStamp]) {
    return;
  }
  touch[post.writeTimeStamp] = post.touch;
  var div = document.createElement('div');
  var date = getDateString(post);
  var title = (post.title && GPEditor.prototype.plusFormatToHtml(post.title, post.mentioned)) || '';

  var error = post.error || '';

  var postMedia = getSavedPostMediaHtml(post) || '';

  div.id = 'post' + post.writeTimeStamp;
  div.onclick = function() {
    editDraft(post.writeTimeStamp);
  };

  var isDraft = (post.state == 'draft');
  var wasDraft = !!document.querySelector('.drafts #' + div.id);
  var stateChange = !!(isDraft ^ wasDraft);
  div.className = 'savedPost';

  var content = trimContent(post.content);

  var contentDiv = document.createElement('div');
  contentDiv.className = 'contentDiv';

  var identity = post.shareAs;

  // Don't look at this :(
  contentDiv.innerHTML = (error && "<div class='postError'>" + error + "</div>") +
                  ((identity && "<img class='postShareAsImage' src='" + identity.image + "?sz=16' title='" + "Share as " + identity.name + "'>") || '') +
                  (date && "<p class='postDate'>" + date + "</p>") +
                  (title && "<span class='postTitle'>" + title + "</span>") +

                  GPEditor.prototype.plusFormatToHtml(content, post.mentioned) +
                  renderReshareMeta(post);

  $(contentDiv.querySelectorAll('a')).attr({href: null});

  var mediaDiv = $('<div class="mediaDiv">' + postMedia + '</div>')[0];

  div.appendChild(contentDiv);
  div.appendChild(mediaDiv);

  var existing = document.getElementById(div.id);
  var column = $('#posts ' + (isDraft ? '.drafts' : '.scheduled') + ' .postsList');
  if (existing) {
    if (stateChange) {
      removeRemovedPosts([post]);
      addPostToColumn(div, column[0], !isDraft);
    } else {
      var existingMediaDiv = existing.querySelector('.mediaDiv');
      if (!existingMediaDiv) {
        existing.innerHTML = div.innerHTML;
      } else {
        existing.querySelector('.contentDiv').innerHTML = contentDiv.innerHTML;
        if (mediaDiv.innerHTML != existingMediaDiv.innerHTML) {
          existingMediaDiv.innerHTML = mediaDiv.innerHTML;
        }
      }
    }
  } else {
    addPostToColumn(div, column[0], !isDraft);
  }
}

function addPostToColumn(div, column, append) {
  if (lastUpdate == 0) {
    if (append) {
      $(div).appendTo($(column));
    } else {
      $(div).prependTo($(column));
    }
  } else {
    $(div).addClass('activity').hide().prependTo($(column)).show('fade', 200, function(){$(this).removeClass('activity')});
  }
}

function trimContent(string) {
  if (!string || !(string > '')) {
    return string;
  }
  var maxChars = 350;
  var trimmed = string.match(/(^[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n)/);
  if (trimmed && trimmed[0]) {
    // Content has line breaks.
    return trimmed[0].replace(/[\n]+$/, '\n&hellip;');
  } else {
    if (string.length > maxChars + 40) {
      string = string.substring(0, maxChars).replace(/\s+$/, '') + '&hellip;';
    }
    return string;
  }
}

function renderMediaItems(medias) {
  var image = medias.images[0];
  var video = medias.video;
  var link = medias.link;

  return (link && link.title && link.url ?
      "<h3><a class='mediaLink' href='" + link.url + "'>" +
      link.title + "</a></h3>" : "") +

  (!link && image ? renderOtherMedia(medias) : '') +
  (link && image ? "<div id='mediaImage'><img src='" + image.url + "'></div>" : "") +

  (video ? "<div id='mediaVideo'><iframe src='" + video.embed + "' width='290' height='200' ></iframe></div>" : '') +

  (link && link.description ? "<div id='mediaDescription'>" + link.description + "</div>" : "") +
  "<div class='clearFix'></div>";
}

function renderOtherMedia(medias) {
  var image = medias.images[0];
  return "<div id='otherMediaImage'>" + (image ? "<img src='" + image.url + "'>" : '') + "</div>";
}

function renderLinkElements(medias) {
  var link = medias.link;
  if (!link) {
    console.error('Missing link');
    return '';
  }

  var chosenIndex = (medias.change && medias.change.chosenImageIndex) || 0;
  var removeDescription = !!(medias.change && medias.change.removeDescription);

  var result = "<h3 id='linkTitle'><a href='" + link.url + "'>" + link.title + "</a><div id='removeLink'></div></h3>";

  var video = medias.video;
  if (!video && medias.images[chosenIndex]) {
    var imagePicker = "<div id='imagePicker'>" +
        (medias.images.length > 1 ?
          "<span id='imagePickPrev'>&lt;</span>" +
          "<span id='imagePickNext'>&gt;</span>" : '') +
        "<span id='removeImage'>X</span></div>";
    result += "<div id='linkImage'>" +
        imagePicker +
        "<img src='" + medias.images[chosenIndex].url + "'></div>";
  }

  if (video) {
    result += "<div id='linkVideo'><iframe src='" + video.embed + "' width='290' height='200' ></iframe></div>";
  }

  if (link.description && !removeDescription) {
    result += "<div id='linkDescription'>" + link.description +
        "<br><span id='removeDescription'>Remove Description</span></div>";
  }

  result += "<div class='clearFix'></div>";
  return result;
}

function refresh() {
  addDraftEditBox();
  refreshPosts();
}

function showScheduleBar() {
  $('#scheduleBar').show();
}

var refreshTimeoutId = 0;
function refreshPosts() {
  window.clearTimeout(refreshTimeoutId);
  if (!document.webkitHidden) {
    chrome.extension.sendRequest({'type': 'fetchAll', 'lastUpdate': lastUpdate}, function(result) {
      if (result.lastUpdate == lastUpdate) {
        return;
      }
      result.posts && renderAllPosts(result.posts);
      lastUpdate = result.lastUpdate;
    });
  }
  refreshTimeoutId = window.setTimeout(refreshPosts, 300);
}

function populateEditorMediaArea(medias) {
  var link = $('#link').val();
  var mediasLink = medias && medias.link && medias.link.url;
  function populate(html) {
    $('#postMedia').html(html);
    if (!$('#postMedia').is(':visible')) {
      $('#postMedia').show('blind', 500);
      $('#linkBar').hide('blind', 100);
    }
    $('#postActions .postAction span').attr({'class': 'disabled'});
    $('#addPhotoAction').attr({
      'class': 'override',
      'title': 'Remove link and add photo'
    });
    $('#addLinkAction').attr({'class': 'loaded'});
  };
  if (link || mediasLink) {
    if (link == mediasLink) {
      populate(renderLinkElements(medias));
    } else {
      chrome.extension.sendRequest({type: 'getLinkMedia', link: link}, function(result) {
        if (result) {
          populate(renderLinkElements(result));
          currentMedias = result;
        }
      });
    }
  } else {
    if (medias && (medias.video || medias.images && medias.images.length)) {
      populate(renderOtherMedia(medias));
    } else {
      $('#postMedia').html('');
      $('#addLinkAction').attr({'class': 'enabled'});
    }
  }
}

function uncollapse(force) {
  if ($('#editbox').is('.collapsed') || force === true) {
    if ($('#shareUrlContainer').is(':visible')) {
      $('#shareUrlContainer').hide('blind', 400);
    }
    $('#titlePlaceholder').text('Title (optional)');
    $('#editbox').removeClass('collapsed');
    var pos = function() {
      $('#collapseEditbox').css({cursor: ''})
          .attr({title: $('#collapseEditbox').data('title')})
          .animate({opacity: 1}, 400);
    };
    if (force === true) {
      $('.hideWhenCollapsed').show();
      pos();
    } else {
      $('.hideWhenCollapsed').show('blind', 400, pos);
    }
    $('#posts').css({opacity: 0.7});
  }
}

function collapse(immediately) {
  if (!$('#editbox').is('.collapsed')) {
    if (activeXhr) {
      activeXhr.abort();
      activeXhr = undefined;
    }
    $('#collapseEditbox').animate({opacity: 0}, 400, function(){
      $(this).css({cursor: 'default'})
          .data('title', $(this).attr('title') || '')
          .attr({title: ''});
    });
    $('#postMedia').hide();
    $('#titlePlaceholder').text('Create new post...');
    $('#editbox').addClass('collapsed');
    if (isEmptyPost(getEditedPost())) {
      delPost();
    } else {
      window.setTimeout(function() {
        needRefresh = false;
        addDraftEditBox();
      }, 40);
    }
    if (immediately === true) {
      $('.hideWhenCollapsed, #scheduleBar').hide();
    } else {
      $('.hideWhenCollapsed, #scheduleBar:visible').hide('blind', 400);
    }
    $('#posts').css({opacity: 1.0});
    // TODO: figure this out so I don't have to repeat myself.
    $('#editbox, #circleChooserBar, .buttonNotSchedule').css({opacity: 1});
    $('#buttonSchedule').text('schedule');
    $('#linkBar').hide();
    var sbutton = $('#buttonSchedule');
    sbutton.removeClass('opened');
    sbutton.addClass('closed');
    sbutton.data('active', null);
    resetDeleteButton();
    $('.gp-mention').remove();
    linked = {};
    circlesNotify = {};
    if ($('#identityChooserBar').is(':visible')) {
      $('#identityChooserBar').hide('blind', 400);
    }
    if (pollManager) {
      $('#addPollAction').removeClass('disabled').addClass('enabled');
      $('#pollBox').hide();
    }
  }
}

function animateButtonText(jButton, newText, duration) {
  jButton.css({color: 'rgba(255,255,255,0)', 'text-shadow': 'none'});
  window.setTimeout(function() {
    jButton.text(newText);
    jButton.css({color: ''});
    window.setTimeout(function(){
      jButton.css({'text-shadow': ''});
    }, duration);
  }, duration);
}

function resetDeleteButton() {
  var jDelete = $('#buttonDelete');
  jDelete.removeClass('confirm').text(jDelete.data('text'));
  var timeoutId = jDelete.data('timeoutId');
  if (timeoutId) {
    window.clearTimeout(timeoutId);
    jDelete.data('timeoutId', 0);
  }
}

function animateBlur(jElement, steps, interval, initial, stepSize) {
  if (steps) {
    if (initial > 0.05) {
      jElement.css({'-webkit-filter': 'blur(' + initial + 'px)'});
    } else {
      jElement.css({'-webkit-filter': ''});
    }
    window.setTimeout(function() {
      animateBlur(jElement, steps - 1, interval, initial + stepSize, stepSize);
    }, interval);
  }
};

function shiftChosenImage(n) {
  if (!currentMedias.change) {
    currentMedias.change = {chosenImageIndex: 0};
  }
  currentMedias.change.chosenImageIndex =
      (currentMedias.change.chosenImageIndex + currentMedias.images.length + n) %
        currentMedias.images.length;
  populateEditorMediaArea(currentMedias);
}

function changeTimeIfDraft() {
  var date = new Date($('#dateTimeInput').val());
  if (date.toString() != 'Invalid Date' && document.querySelector('.drafts #post' + $('#write_time_stamp').val())) {
    $('#time').val(date.getTime());
  }
}

function setListeners() {
  function setPositions() {
    $('#sendFeedback').position({my:'left top', at:'right top', of:'#appWrap', offset: '10 -30', collision: 'none'});
    $('#tellOthers').position({my: 'left', at: 'right', of: '#sendFeedback', offset: '20 0', collision: 'none'});
    $('#community').position({my: 'right', at: 'left', of: '#sendFeedback', offset: '-20 0', collision: 'none'});
    $('#openSettings').position({my: 'right top', at: 'left top', of: '#appWrap', offset: '-90 -75', collision: 'none'});
  };
  setPositions();
  $(window).resize(function() {
    setPositions();
  });
  $('#addLink').delegate('.enabled', 'click', function() {
    trackClick('addLink.open');
    $('#linkBar').show('blind', 200);
    $('#attachments').addClass('notempty');
    $('#postActions .postAction span').removeClass('enabled');
    $('#postActions .postAction span').addClass('disabled');
    $('#linkInput').focus();
  });
  $('#addLink').delegate('.disabled', 'click', function() {
    trackClick('addLink.close');
    $('#linkBar').hide('blind', 200);
    $('#attachments').removeClass('notempty');
    $('#postActions .postAction span').removeClass('disabled');
    $('#postActions .postAction span').addClass('enabled');
  });
  function removeLink() {
    // Remove Link
    $('#link, #linkInput').val('');
    currentMedias = undefined;
    $('#attachments').removeClass('notempty');
    $('#postMedia').hide('blind', 200, function(){$(this).html('');});
    $('#postActions span').attr({'class': 'enabled'});
    // Force autosave.
    post('autosave');
  };
  $('#addLink').delegate('.loaded', 'click', function() {
    trackClick('addLink.removeLink');
    removeLink();
  });
  $('#attachments').delegate('#removeLink', 'click', function() {
    trackClick(this.id);
    $('#addLinkAction').click();
  });
  $('#submitLink').click(function() {
    trackClick(this.id);
    if ($('#linkBar').is(':visible')) {
      $('#linkBar').hide('blind', 100);
    }
    $('#link').val($('#linkInput').val());
    populateEditorMediaArea();
  });
  $('#linkInput').keydown(function(e) {
    if (e.keyCode == 13) {
      $('#submitLink').click();
    }
  });
  $('#buttonSchedule').click(function() {
    trackClick(this.id);
    var jself = $(this);
    var muteWhenScheduling = '#editbox, .buttonNotSchedule';
    if (jself.data('active')) {
      $('#scheduleBar').hide('blind', 400);
      jself.removeClass('opened');
      jself.addClass('closed');
      jself.data('active', null);
      $(muteWhenScheduling).css({opacity: 1.0});
      animateButtonText(jself, 'schedule', 300);
    } else {
      $('#scheduleBar').show('blind', 200);
      dateTimePickerSetup();
      $('#dateTimeInput').datetimepicker('show');
      jself.removeClass('closed');
      jself.addClass('opened');
      jself.data('active', true);
      $(muteWhenScheduling).css({opacity: 0.4});
      animateButtonText(jself, 'cancel', 400);
    }
  });
  $('#buttonDelete').click(function() {
    trackClick(this.id);
    if ($(this).is('.confirm')) {
      trackClick(this.id + 'Confirm');
      delPost();
      collapse();
      resetDeleteButton();
    } else {
      trackClick(this.id + 'First');
      var duration = 200;
      $(this).data('text', $(this).text())
        .slideUp(duration, function() {
          $(this).text('are you sure?')
            .addClass('confirm')
            .slideDown(duration);
        });
      var self = this;
      $(this).data('timeoutId', window.setTimeout(function() {
        $(self).slideUp(duration, function() {
          $(self).text($(self).data('text'))
              .removeClass('confirm')
              .slideDown(duration);
        });
      }, 10000));
    }
  });
  $('#buttonDraft').click(function() {
    if (document.getElementById('uploadProgress')) {
      var jself = $(this);
      animateButtonText(jself, 'uploading image', 300);
      window.setTimeout(function() {
        animateButtonText(jself, 'share now', 300);
      }, 5000);
      return;
    }
    trackClick(this.id);
    post('draft');
    collapse();
  });
  $('#buttonScheduleStepTwo').click(function() {
    trackClick(this.id);
    if (localStorage['iUnderstand'] == "1") {
      var date = new Date($('#dateTimeInput').val());
      var jself = $(this);
      if (date.toString() == 'Invalid Date') {
        animateButtonText(jself, 'invalid time', 300);
        $('#dateTimeInput').datetimepicker('show');
        window.setTimeout(function() {
          animateButtonText(jself, 'schedule', 300);
        }, 5000);
        return;
      }
      if (date < new Date()) {
        animateButtonText(jself, 'time too early', 300);
        $('#dateTimeInput').datetimepicker('show');
        window.setTimeout(function() {
          animateButtonText(jself, 'schedule', 300);
        }, 5000);
      } else if (document.getElementById('uploadProgress')) {
        animateButtonText(jself, 'uploading image', 300);
        window.setTimeout(function() {
          animateButtonText(jself, 'schedule', 300);
        }, 5000);
      } else if (getEditedPost().entities.length == 0) {
        animateButtonText(jself, 'select circles', 300);
        window.setTimeout(function() {
          animateButtonText(jself, 'schedule', 300);
        }, 5000);
        if (!_notSelected) {
          _notSelected = 1;
        } else {
          $('#circleChooser').focus();
        }
      } else {
        window.setTimeout(function() {
          $('#time').val(date.getTime());
          post('scheduled');
          collapse();
        }, 10);
      }
    } else {
      animateBlur($('#appWrap, .topTab'), 5, 200, 0, 0.4);
      $('#information').fadeIn(1000);
    }
  });
  $('#iUnderstand').click(function() {
    trackClick(this.id);
    animateBlur($('#appWrap, .topTab'), 5, 200, 1.6, -0.4);
    $('#information').fadeOut(1000);
    localStorage['iUnderstand'] = '1';
    $('#buttonScheduleStepTwo').click();
  });
  $('#buttonPost').click(function() {
    var jself = $(this);
    if (document.getElementById('uploadProgress')) {
      animateButtonText(jself, 'uploading image', 300);
      window.setTimeout(function() {
        animateButtonText(jself, 'share now', 300);
      }, 5000);
      return;
    } else if (getEditedPost().entities.length == 0) {
      animateButtonText(jself, 'select circles', 300);
      window.setTimeout(function() {
        animateButtonText(jself, 'share now', 300);
      }, 5000);
      if (!window._notSelected) {
        _notSelected = 1;
      } else {
        $('#circleChooser').focus();
      }
      return;
    }
    trackClick(this.id);
    post('post');
    collapse();
  });
  $('#editbox').keyup(function() {
    needRefresh = true;
  });
  $('input:not(#linkInput)').change(function(e) {
    needRefresh = true;
  });
  $('#sendFeedback').click(function(e) {
    trackClick(this.id);
    e.stopPropagation();
    needRefresh = true;
    autosave();
    collapse();
    window.setTimeout(function() {
      addDraftEditBox({
        title: 'Do Share Feedback',
        content: '\n\n#DoShareFeedback #DoShare\n\n_(CC @115470071077898720170)_',
        entities: [{personId: '115470071077898720170', name: 'Tzafrir Rehan'}],
        mentioned: {'115470071077898720170': 'Tzafrir Rehan'}
      });
      uncollapse();
      $('[contenteditable]').focus();
    }, 200);
  });
  $('#tellOthers').click(function(e) {
    trackClick(this.id);
    e.stopPropagation();
    needRefresh = true;
    autosave();
    collapse();
    window.setTimeout(function() {
      addDraftEditBox({
        content: 'I\'m using @101401846468080203736 by @115470071077898720170 to write and schedule my Google+ posts!\n\n#DoShare',
        entities: [{circleId: 'PUBLIC', name: 'Public'},
                   {personId: '115470071077898720170', name: 'Tzafrir Rehan'},
                   {personId: '101401846468080203736', name: 'Do Share'}],
        mentioned: {'115470071077898720170': 'Tzafrir Rehan', '101401846468080203736': 'Do Share'},
        link: 'https://chrome.google.com/webstore/detail/oglhhmnmdocfhmhlekfdecokagmbchnf'
      });
      uncollapse();
      $('[contenteditable]').focus();
    }, 200);
  });
  $('#circleChooser')
      .keydown(function(e) {
        if (e.keyCode == $.ui.keyCode.TAB) {
          e.stopImmediatePropagation();
        }
      })
      .autocomplete({
    minLength: 0,
    appendTo: $('#circleChooserBar'),
    position: {
      of: $('#circleChooserBar')
    },
    focus: function(){},
    autoFocus: true,
    open: function() {
      $('.ui-autocomplete').css('width', 'inherit');
      $('#closeCircleChooser')
          .css({opacity: 1});
    },
    close: function() {
      $('#closeCircleChooser').css({opacity: 0});
    },
    select: function(event, ui) {
      if (ui.item.communityId) {
        selectCommunityCategory(ui.item.communityId, ui.item.originalName);
        return true;
      }
      if (ui.item.circleId == 'NO_PUBLIC') {
        $('#circleChooser').autocomplete('search', '');
        return false;
      }
      needRefresh = true;
      audienceChooser.addEntity(ui.item);
      $('#circleChooser').autocomplete('search', '');
    },
    source: function(request, callback) {
      if (audienceChooser.getEntities()[0] && audienceChooser.getEntities()[0].communityId) {
        return;
      }
      var identityId = val('share_as_id');
      chrome.extension.sendRequest({type: 'getCircles', identityId: identityId}, function(circles) {
        var curTimeStamp = $('#write_time_stamp').val();
        var matchingCircles = [];

        // TODO: Can later change to check against true once backwards compatibility isn't an issue.
        var memPost = mem[curTimeStamp];
        var allowPublic = true;
        if (memPost && memPost.reshare && (memPost.reshare.isPublic === false)) {
          var selfIdentity = memPost.activeIdentity || (identities[0] && identities[0].id);
          if (!(selfIdentity == memPost.reshare.author_id)) {
            allowPublic = false;
          }
        }
        if (allowPublic) {
          matchingCircles = matchingCircles.concat([{
            name: 'Public',
            circleId: 'PUBLIC',
            photoUrl: 'img/icon_public.png'
          }]);
        } else {
          matchingCircles = matchingCircles.concat([{
            name: 'P̶u̶b̶l̶i̶c̶ &nbsp;&nbsp; (Original post shared with a limited audience)',
            circleId: 'NO_PUBLIC',
            photoUrl: 'img/icon_public.png'
          }]);
        }
        if (!val('share_as_id')) {
          matchingCircles.push({
            name: 'Extended Circles',
            circleId: 'EXTENDED_CIRCLES',
            photoUrl: 'img/icon_extended.png'
          });
        }
        matchingCircles = matchingCircles.concat([
          {
            name: 'Your Circles',
            circleId: 'YOUR_CIRCLES',
            photoUrl: 'img/icon_circles.png'
          }
        ]).concat(circles.filter(function(circle) {
          return !(circle.id == '15' || circle.name == 'Blocked');
        })).filter(function(circle) {
          return !!circle.name.toLowerCase().match(request.term.toLowerCase());
        }).map(function(circle) {
          return {
            name: circle.name,
            circleId: circle.circleId || circle.id,
            photoUrl: circle.photoUrl || 'img/icon_circle.png',
            count: circle.count
          };
        }).filter(function(circle) {
          // Drop circles that are already chosen.
          return !document.querySelector('.c_' + circle.circleId);
        });
        chrome.extension.sendRequest({type: 'getCommunities', identityId: identityId}, function(communities) {
          matchingCircles = matchingCircles.concat(communities.map(function(c) {
            c.originalName = c.name;
            c.name += ' (community, ' + c.numMembers + ')';
            c.communityId = c.id;
            c.photoUrl += '?sz=24';
            return c;
          }).filter(function(c) {
            return !!c.originalName.toLowerCase().match(request.term.toLowerCase());
          }));
          callback(matchingCircles);
          if (request.term.length > 0) {
            chrome.extension.sendRequest({type: 'profileAutocomplete', prefix: request.term}, function(profiles) {
              profiles.forEach(function(profileResult) {
                profileResult.personId = profileResult.id;
              });
              callback(matchingCircles.concat(profiles));
            });
          }
        });
      });
    }
  }).focus(function() {
    if (!($('.ui-autocomplete').is(':visible'))) {
      $('#circleChooser').autocomplete('search');
    }
  }).keydown(function(event) {
    var KEY = {
      BACKSPACE: 8
    };
    var k = event.keyCode;
    if (k == KEY.BACKSPACE && !$(this).val()) {
      audienceChooser.removeLastEntity();
    }
  }).data('autocomplete')._renderItem = function(ul, item) {
    return $('<li></li>')
      .data('item.autocomplete', item)
      .append('<a><span class="entityPhoto">' + (item.photoUrl ? '<img src="' + item.photoUrl + '" /' + '>' : '') +
          '</span>' +  item.name + '</a>')
      .appendTo(ul);
  };
  $('#circleChooserBar')
      .delegate('#circleChooserBar *', 'click', function(e){e.stopPropagation();})
      .click(function() {$('#circleChooser').focus()});
  $('.titleBar').click(function() {
    uncollapse();
    $('.titleBar [contenteditable]').focus();
  });
  $('#collapseEditbox').click(function() {
    collapse();
    trackClick(this.id);
  });
  {
    $('#bodyWrap').click(function(e){
      trackClick('sidebarClose');
      collapse();
    });
    $('#appWrap').click(function(e){
      // Block the event from reaching bodyWrap's handler.
      e.stopPropagation();
    });
  }
  $('#attachments').delegate('#imagePickPrev', 'click', function() {
    shiftChosenImage(-1);
  });
  $('#attachments').delegate('#imagePickNext', 'click', function() {
    shiftChosenImage(1);
  });
  $('#attachments').delegate('#removeImage', 'click', function() {
    if (!currentMedias.change) {
      currentMedias.change = {};
    }
    currentMedias.change.chosenImageIndex = -1;
    populateEditorMediaArea(currentMedias);
  });
  $('#attachments').delegate('#removeDescription', 'click', function() {
    if (!currentMedias.change) {
      currentMedias.change = {};
    }
    currentMedias.change.removeDescription = true;
    populateEditorMediaArea(currentMedias);
  });
  $('footer a').click(function() {
    trackClick('profile' + this.innerText.replace(' ', ''));
  });
  $('#closeCircleChooser').click(function() {
    trackClick(this.id);
  });
  $('#editbox, #linkInput').bind('paste', function(evt) {
    var pasted = evt.originalEvent.clipboardData.getData('text/plain');
    if (pasted && pasted.match(/^http(|s):\/\/[^\s]*$/)) {
      if (!(linked[pasted]) && ($('#addLinkAction').is('.enabled') || $(this).is('input'))) {
        evt.preventDefault();
        addLink(pasted);
        linked[pasted] = true;
        $('#addPhotoAction').removeClass('active').addClass('disabled');
      }
    }
  });
  $('#addPhoto').delegate('.enabled, .override', 'click', function() {
    if ($(this).is('.override')) {
      removeLink();
    }
    trackClick('addPhoto');
    var authed = false;
    function file_click() {
      if (authed) {
        $('#photo_file').click();
        window.clearInterval(intervalId);
      }
    };
    var intervalId = window.setInterval(file_click, 100);
    chrome.permissions.request({
      origins: ['https://picasaweb.google.com/', 'https://www.google.com/']
    }, function(granted) {
      if (granted) {
        chrome.extension.sendRequest({type: 'oauthAuthenticate'}, function(oauth) {
          if (oauth) {
            authed = true;
          }
        });
      } else {
        window.clearInterval(intervalId);
        _gaq.push(['_trackEvent', 'NotGranted', 'ChromePermissionsGoogleCom']);
      }
    });
  });
  $('#photo_file').change(function() {
    $('#addPhotoAction').attr({class: 'invalid'});
    var file = this.files[0];
    if (file) {
      createAlbumIfNotExisting(function(albumId) {
        uploadImage(file, albumId);
      });
    }
    this.value = '';
  });
  $('#shareUrlContainer').delegate('a', 'click', function(evt) {
    evt.originalEvent.preventDefault();
  }).click(function() {
    trackClick(this.id);
    uncollapse();
    addLink($('#shareUrlContainer a').attr('href'));
  });
  $('#attachments').delegate('a', 'dragstart', function(evt) {
    evt.originalEvent.dataTransfer.setData('text/html',
        '<a href=' + this.href + '>' + this.href + '</a>');
  }).delegate('#removeReshare', 'click', function(evt) {
    trackClick(this.id);
    delete mem[val('write_time_stamp')].reshare;
    $('#attachments').hide('blind', '200', function() {
      $(this).removeClass('notempty');
      $('#reshare').html('');
      $(this).show();
      $('#share_id').val('');
      $('#postActions span').attr({'class': 'enabled'});
      needRefresh = true;
      autosave();
    });
  });
  $('#circleChooserBar').delegate('.audienceChooserEntity', 'mouseover', function(){
    if ($(this).data('dialog')) {
      return;
    }
    if (!$(this).data('count')) {
      return;
    }
    var timeoutId = window.setTimeout(function() {
      $(this).data('timeoutId', null);
      var dialog = $('<div>').addClass('circleNotifyDialog').appendTo(document.body);
      var sum = 0;
      var count = $(this).data('count');
      for (var key in circlesNotify) {
        sum += circlesNotify[key];
      }
      var MAX_NOTIFY = 100;
      if (sum + count <= MAX_NOTIFY || circlesNotify[$(this).data('id')]) {
        dialog.append(
          $('<input id="notify_' + $(this).data('id') + '" type="checkbox" ' +
              (circlesNotify[$(this).data('id')] ? 'checked' : '') + '>' +
              '<label for="notify_' + $(this).data('id') + '">' +
              'notify ' + count + ' ' + (count == 1 ? 'person' : 'people') + ' about this post</label>'));
      } else {
        dialog.addClass('notifyTooMany');
        dialog.append($('<span>cannot notify ' + $(this).data('count') + ' ' + (count == 1 ? 'person' : 'people') +
            '<br>only up to ' + MAX_NOTIFY + ' people may be notified about a post</span>'));
      }
      dialog.position({
        my: 'center bottom',
        at: 'center top',
        of: this,
        offset: '0 1'
      }).hide()
        .fadeIn(300)
        .data('owner', this)
        .data('id', $(this).data('id'))
        .data('count', $(this).data('count'));
      $(this).data('dialog', dialog);
    }.bind(this), 666);
    $(this).data('timeoutId', timeoutId);
  }).delegate('.audienceChooserEntity', 'mouseout', function(evt) {
    var timeoutId = $(this).data('timeoutId');
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    } else if ($(this).data('dialog')) {
      if ($(evt.toElement).is('.circleNotifyDialog, .audienceChooserEntity, .audienceChooserEntity *')) {
        return;
      }
      $(this).data('dialog').remove();
      $(this).data('dialog', null);
    }
  });
  $(document).delegate('.circleNotifyDialog', 'mouseout', function(evt) {
    if ($(evt.toElement).is('.circleNotifyDialog, .circleNotifyDialog *') ||
        $(evt.toElement).is($(this).data('owner'))) {
      return;
    }
    $($(this).data('owner')).data('dialog', null);
    $(this).remove();
  });
  $(document).delegate('.circleNotifyDialog input[type=checkbox]', 'change', function(evt) {
    var checked = evt.target.checked;
    var p = $(this.parentNode);
    var id = p.data('id');
    if (checked) {
      circlesNotify[id] = p.data('count');
    } else {
      delete circlesNotify[id];
    }
  });
  $('#settingPromoText').val(Settings.get('promoText'))
      .change(function() {
        var val = $(this).val();
        Settings.set('promoText', val);
        _gaq.push(['_trackEvent', 'settingPromoText', val]);
      });
  $('#settingAlternateAccount').val(Settings.get('alternateAccount'))
      .change(function() {
        var val = $(this).val();
        Settings.set('alternateAccount', val);
        _gaq.push(['_trackEvent', 'alternateAccount', val]);
        chrome.extension.sendRequest({type: 'reInit'}, function() {});
      });
  $('#settingAlwaysShare').val(Settings.get('alwaysShare'))
      .change(function() {
        var val = $(this).val();
        Settings.set('alwaysShare', val);
        _gaq.push(['_trackEvent', 'alwaysShare', val]);
      });
  $('#openSettings').click(function() {
    trackClick(this.id);
    var settings = $('#settings');
    if (!settings.is(':visible')) {
      settings.show('blind', 300);
      $(this).css({
        '-webkit-transform': 'rotate(180deg)'
      });
      if (identities.length < 2) {
        $('#postNumberingContainer').html(
          '<p>Automatically number public posts <select id="settingPostNumbering">' +
          '<option value="0">No (default)</option>' +
          '<option value="1" id="numberingOption1">Yes</option></select></p>');
        chrome.extension.sendRequest({type: 'getPostNumberingString'}, function(str) {
          $('#numberingOption1').text('Yes: ' + str);
        });
        $('#settingPostNumbering').val(Settings.get('postNumbering'))
          .change(function() {
            var val = $(this).val();
            Settings.set('postNumbering', val);
            _gaq.push(['_trackEvent', 'postNumbering', val]);
          });
      } else {
        $('#postNumberingContainer').html('<p id="postNumberingIdentityHeader">Automatically number posts for:</p>');
        identities.forEach(function(identity) {
          var info = chrome.extension.getBackgroundPage().plus._info;
          var id = info && info.id;
          var actualId = (identity.id == id ? '' : identity.id);
          $('#postNumberingContainer').append($('<div class="postNumberingIdentity">').append(
            $('<p>' + identity.name + '</p>').append($('<select id="settingPostNumbering' + identity.id + '">' +
            '<option value="0">No (default)</option>' +
            '<option value="1" id="numberingOption' + identity.id + '">Yes</option></select></p>)'
          ).change(function() {
            Settings.set('postNumbering' + actualId, $(this).val())
          }))));
          $('#settingPostNumbering' + identity.id).val(Settings.get('postNumbering' + actualId));
          chrome.extension.sendRequest({type: 'getPostNumberingString', id: identity.id}, function(str) {
            $('#settingPostNumbering' + identity.id + ' option[value=1]').text('Yes: ' + str);
          });
        })
      }
    } else {
      settings.hide('blind', 300);
      $(this).css({
        '-webkit-transform': 'rotate(0)'
      });
    }
  });
  $('#refreshLogin').click(function() {
    chrome.extension.sendRequest({type: 'refreshLogin'}, function() {});
  });
  $('#content').bind('keydown', function(e) {
    var KEY_TAB = 9;
    if (e.keyCode == 9 && !e.shiftKey) {
      $('#buttonPost').focus();
      e.preventDefault();
    }
  });
  $('#newsBulletin').click(function() {
    $(this).hide(500);
    localStorage['_news_0002'] = '1';
  });
  $('#addPollOption').click(function() {
    pollManager.addOption();
    needRefresh = true;
  });
  $('#pollBox').delegate('.removeOption', 'click', function(evt) {
    var index = this.id.replace(/^removeOption/, '');
    pollManager.removeOption(index);
  });
  $('#pollBox').delegate('input', 'keyup', function(evt) {
    pollManager.readChanges();
    needRefresh = true;
  });
  $('#addPoll').delegate('.enabled', 'click', function() {
    if (!pollManager || !pollManager.isActive()) {
      pollManager = new PollManager();  
      pollManager.init();
    }
    $(this).removeClass('enabled').addClass('disabled');
    $('#pollBox').show('blind', 300);
  });
  $('#buttonCancelPoll').click(function() {
    $('#addPollAction').removeClass('disabled').addClass('enabled');
    $('#pollBox').hide('blind', 300, function() {
      pollManager.destroy();
    });
  });
}

// END LISTENERS

function addLink(url) {
  $('#attachments').addClass('notempty');
  $('#linkInput').val(url);
  $('#submitLink').click();
}

function dateTimePickerSetup() {
  $('#dateTimeInput').datetimepicker({
    currentText: 'today',
    closeText: '',
    beforeShow: function(t, inst) {
      if (!$('#dateTimeInput').val()) {
        $('#dateTimeInput').datetimepicker('setDate', (new Date()));
      }
      window.setTimeout(function() {
        var j = inst.dpDiv;
        j.position({
          my: 'left top',
          at: 'left bottom',
          of: '#scheduleBar',
          collision: 'none',
          offset: '-6 -1'
        });
        j.hide();
        j.show('blind', 150);
      }, 1);
    },
    onSelect: changeTimeIfDraft,
    dayNamesMin: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
    minDateTime: new Date(),
    showButtonPanel: true,
    showOtherMonths: true,
		selectOtherMonths: true
  });
}

function uploadImage(file, albumId) {
  var oauth = chrome.extension.getBackgroundPage().oauth;
  var method = 'POST';
  var url = 'https://picasaweb.google.com/data/feed/api/user/default/albumid/' + albumId;

  $('#attachments').addClass('notempty');
  $('#postMedia').html('<meter id="uploadProgress"></meter>').show('blind', 100);

  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);
  xhr.setRequestHeader("GData-Version", '3.0');
  xhr.setRequestHeader("Content-Type", file.type);
  xhr.setRequestHeader("Slug", file.name);
  xhr.setRequestHeader("Authorization", oauth.getAuthorizationHeader(url, method, ''));
  xhr.onreadystatechange = function(data) {
    if (xhr.readyState == 4) {
      var match = xhr.response.match(/<gphoto:id>(\d+)<\/gphoto:id>/);
      if (match && match[1]) {
        $('#image_id').val(match[1]);
        window.setTimeout(function(){
          post('autosave');
        }, 10);
        match = xhr.response.match(/<content[^>]*src='([^']*)'/);
        if (match && match[1]) {
          var medias = {images: [{url: match[1]}]};
          populateEditorMediaArea(medias);
        }
      }
    }
  };
  xhr.upload.onprogress = function(event) {
    $('#uploadProgress').val(event.loaded / file.size);
  }.bind(this);
  xhr.onerror = function(){_gaq.push(['_trackEvent', 'Failure', 'imageUpload']);}
  activeXhr = xhr;
  xhr.send(file);
  $('#postingAsAction').attr({'class': 'disabled'});
  redrawIdentities();
}

function createAlbumIfNotExisting(callback) {
  var ALBUM_TITLE = 'Photos from Do Share';
  var oauth = chrome.extension.getBackgroundPage().oauth;
  var url = 'https://picasaweb.google.com/data/feed/api/user/default/';
  oauth.sendSignedRequest(url, function(data) {
    var json;
    try {
      json = JSON.parse(data);
    } catch(e) {
      console.error(e);
      _gaq.push(['_trackEvent', 'Failure', 'albumFeedParseError']);
      return;
    }
    try {
      var albums = json.feed.entry;
      var album = albums.filter(function(album) {
        return album.title && album.title.$t == ALBUM_TITLE;
      })[0];
      if (album) {
        var id = album.gphoto$id.$t;
        if (id) {
          callback(id);
        } else {
          throw "No id in album";
        }
      } else {
        _gaq.push(['_trackEvent', 'NewAlbum', ALBUM_TITLE]);
        createAlbum(ALBUM_TITLE, callback);
      }
    } catch(e) {
      console.error('Error visiting album objects', e);
      _gaq.push(['_trackEvent', 'Failure', 'albumInternalError: ' + e.toString()]);
    }
  }, {parameters: {alt: 'json'}});
}

function createAlbum(albumName, callback) {
  var oauth = chrome.extension.getBackgroundPage().oauth;
  var url = 'https://picasaweb.google.com/data/feed/api/user/default/';
  oauth.sendSignedRequest(url, function(newAlbumData) {
    try {
      var id = JSON.parse(newAlbumData).entry.gphoto$id.$t;
      if (id) {
        callback(id);
      } else {
        throw "no id in newAlbumData";
      }
    } catch (e) {
      _gaq.push(['_trackEvent', 'Failure', 'new album error: ' + e.toString()]);
    }
  }, {
    method: 'POST',
    parameters: {alt: 'json'},
    headers: {
      'GData-Version': 3,
      'Content-Type': 'application/atom+xml'
    },
    body: "<entry xmlns='http://www.w3.org/2005/Atom' xmlns:media='http://search.yahoo.com/mrss/' xmlns:gphoto='http://schemas.google.com/photos/2007'>\n" +
          "<title type='text'>" + albumName + "</title>\n" +
          "<category scheme='http://schemas.google.com/g/2005#kind' term='http://schemas.google.com/photos/2007#album'></category></entry>"
  });
}

function autosave() {
  if (!needRefresh) {
    return;
  }
  needRefresh = false;
  var currentPost = getEditedPost('', 0);
  if (isEmptyPost(currentPost)) {
    return;
  }
  post('autosave');
}

function redrawIdentities() {
  var identities = window.identities;
  if (!(identities.length > 1)) {
    $('#postingAsAction').html('').hide();
    return;
  }
  var current = identities[0];
  var activeIdentity = mem[val('write_time_stamp')] && mem[val('write_time_stamp')].activeIdentity;
  if (activeIdentity) {
    var activeIdentityDetails = identities.filter(
      function(identity) {
        return identity.id == activeIdentity;
      }
    )[0];
    if (activeIdentityDetails) {
      current = activeIdentityDetails;
      identities = [activeIdentityDetails];
      $('#share_as_id').val(current.id);
      $('#share_as_name').val(current.name);
      $('#share_as_image').val(current.image_url);
    }
  } else if (val('share_as_id')) {
    current = {
      id: val('share_as_id'),
      name: val('share_as_name'),
      image_url: val('share_as_image')
    }
  }
  var opacity = ($('#postingAsAction img').css('opacity') < 1) ? 0 : 1;
  var title = $('#postingAsAction').is('.disabled') ?
      'Do Share cannot share your photo from a different account' :
      'Share as ' + current.name;
  $('#postingAsAction')
      .html('')
      .show()
      .append($('<img src="' + current.image_url + '?sz=20' + '"' +
        ' title="' + title + '">').css({opacity: opacity}));
  $('#postingAs').unbind('click').click(function() {
    if (!$('#postingAsAction').is('.enabled')) {
      return;
    }
    var bar = $('#identityChooserBar');
    if (bar.is(':visible')) {
      bar.hide('blind', 300);
    } else {
      bar.show('blind', 300);
      $('body').animate({scrollTop: $('#circleChooserBar').position()['top'] - 500}, 450);
    }
  });
  var lines = identities.map(function (identity) {
    return $('<div class="identityLine' + ((identity.id == current.id) ? ' selected' : '') + '">' +
        '<span class="entityPhoto"><img src="' + identity.image_url + '?sz=20' + '"></span>' + identity.name + '</div>')
        .click(function(evt){
      audienceChooser.keepOnlyPublic();
      $('#postingAsAction img').animate({opacity: 0}, 150);
      $(evt.target).addClass('selected');
      window.setTimeout(function() {
        redrawIdentities();
        $('#postingAsAction img').animate({opacity: 1}, 300);
        $('#identityChooserBar').hide('blind', 300);
      }, 150);
      if (identity != identities[0]) {
        $('#share_as_id').val(identity.id);
        $('#share_as_name').val(identity.name);
        $('#share_as_image').val(identity.image_url);
        $('#addPhotoAction').attr({
          'class': 'disabled',
          'title': 'Do Share can\'t upload an image to a page\'s album'
        });
      } else {
        $('#share_as_id, #share_as_name, #share_as_image').val('');
        $('#addPhotoAction').attr({
          'class': 'enabled',
          'title': ''
        });
      }
    });
  });
  $('#identityChooserBar').html('');
  lines.forEach(function(line) {
    $('#identityChooserBar').append(line)
  });
}

function selectCommunityCategory(communityId, communityName) {
  chrome.extension.sendRequest({type: 'getCommunityCategories', communityId: communityId, identityId: val('share_as_id')},
      function(categories) {
    $('#communityCategoryBar .categoryLine').remove();
    $('#circleChooser').blur();
    if (categories.length == 1) {
      audienceChooser.addCommunity({
        name: communityName,
        categoryName: categories[0].name,
        communityId: communityId,
        categoryId: categories[0].id
      });
      return;
    }
    categories.forEach(function(c) {
      var div = $('<div class="categoryLine">' + c.name + '</div>');
      div.click(function(e) {
        audienceChooser.addCommunity({
          name: communityName,
          categoryName: c.name,
          communityId: communityId,
          categoryId: c.id
        });
        $('#communityCategoryBar').hide('blind', 200);
      });
      $('#communityCategoryBar').append(div);
    });
    $('#communityCategoryBar').show('blind', 400);
  });
}

/**
 * Entity {
 *   circleId OR personId OR (communityId, categoryId)
 *   name
 * }
 */
function AudienceChooser(entities) {
  this._entities = entities || [];
  this._chooser = $('#circleChooser');
  this.updateChooser();
}

AudienceChooser.prototype.updateChooser = function() {
  $('.audienceChooserEntity').remove();
  var self = this;
  if (this._entities[0] && this._entities[0].communityId) {
    $('#circleChooser').hide();
  } else {
    $('#circleChooser').show();
  }
  $(this._entities.map(function(entity) {
    return $('<div class="audienceChooserEntity ' +
        ((entity.communityId) ? 'com_' + entity.communityId : (entity.circleId ? 'c_' + entity.circleId : 'p_' + entity.personId)) + '">' +
        (entity.communityId ? entity.name + ' (' + entity.categoryName + ')' : entity.name) + '</div>').append(
          $('<span>x</span>')
              .addClass('deleteEntityButton')
              .click(function(evt) {
                $(this).trigger('mouseout');
                self.removeEntity(entity);
                evt.originalEvent.stopPropagation();
              })
        ).data('count', entity.count || null)
        .data('id', entity.circleId || null)[0];
  })).prependTo($('#circleChooserBar'));
}

AudienceChooser.prototype.getEntities = function() {
  return this._entities;
}

AudienceChooser.prototype.addEntity = function(entity) {
  if (!entity || document.querySelector('.p_' + entity.personId)) {
    return;
  }
  this._entities.push(entity);
  this.updateChooser();
}

AudienceChooser.prototype.removeEntity = function(entity) {
  this._entities = this._entities.filter(function(e) {
    return e != entity;
  });
  this.updateChooser();
}

AudienceChooser.prototype.removeLastEntity = function() {
  this._entities.pop();
  this.updateChooser();
}

AudienceChooser.prototype.keepOnlyPublic = function() {
  this._entities = this._entities.filter(function(entity) {
    return entity.circleId == 'PUBLIC';
  });
  this.updateChooser();
}

AudienceChooser.prototype.addCommunity = function(entity) {
  this._entities = [entity];
  this.updateChooser();
}

function PollManager() {
  this._options = [];
  this._isActive = false;
}

PollManager.prototype.init = function() {
  this._options = ['No', 'Maybe', 'Yes'];
  this._writeToPage();
  this._isActive = true;
}

PollManager.prototype.isActive = function() {
  return !!this._isActive;
}

PollManager.prototype.destroy = function() {
  this._isActive = false;
  this._options = [];
}

PollManager.prototype.fromSaved = function(optionList) {
  if (!optionList.forEach) {
    return;
  }
  var self = this;
  optionList.forEach(function(option) {
    self._options.push(option);
  });
  self._writeToPage();
  self._isActive = true;
}

PollManager.prototype._writeToPage = function() {
  $('#pollOptions > div').remove();
  var div = $('<div>');
  this._options.forEach(function(option, i) {
    $('<div><input value="' + option + '" />' +
        '<div class="removeOption" id="removeOption' + i + '"></div></div>').appendTo(div);
  });
  div.appendTo('#pollOptions');
}

PollManager.prototype.addOption = function() {
  this._options.push('');
  this._writeToPage();
}

PollManager.prototype.removeOption = function(i) {
  this._options = this._options.filter(function(a,j) {return j != i;});
  this._writeToPage();
}

PollManager.prototype.readChanges = function() {
  var inputs = $('#pollBox input');
  var newOpts = [];
  for (var i = 0; i < inputs.length; ++i) {
    newOpts.push(inputs[i].value);
  }
  this._options = newOpts;
};

PollManager.prototype.getOptions = function() {
  return [].concat(this._options);
}

function setDragAndDrop() {
  var editbox = document.getElementById('editbox');
  function active() {
    return $('#addPhotoAction').is('.enabled:visible');
  }
  editbox.ondragenter = function(e) {
    if (active()) {
      e.preventDefault();
      return false;
    }
  }
  editbox.ondragleave = function(e) {
    if (active()) {
      e.preventDefault();
      return false;
    }
  }
  editbox.ondragover = function(e) {
    if (active()) {
      e.dataTransfer.dropEffect = 'move';
      e.preventDefault();
      return false;
    }
  }
  editbox.ondrop = function(e) {
    if (active()) {
      $('#addPhotoAction').attr({class: 'invalid'});
      var file = e.dataTransfer.files[0];
      if (file) {
        createAlbumIfNotExisting(function(albumId) {
          uploadImage(file, albumId);
        });
        trackClick('photoDragDrop');
      }
      e.preventDefault();
    }
  }
}

function handleUrlHandoff() {
  var tabJson = localStorage['_tmp_tab'];
  localStorage.removeItem('_tmp_tab');
  if (tabJson) {
    var tab = JSON.parse(tabJson);
    if (!(Settings.get('alwaysShare') == '1')) {
      $('#shareUrlContainer')
        .append($('<div class="savedUrlDiv">')
          .append($('<p>Share <a href="' + tab.url + '">' + tab.title + '</a></p>')
              .prepend($(tab.favIconUrl ? '<img src="' + tab.favIconUrl + '" width=16 height=16>' : ''))))
        .show();
    } else {
      uncollapse();
      addLink(tab.url);
      needRefresh = false;
    }
  }
}

function onLoad() {
  refreshIdentities();
  var savedPostJson = localStorage['_tmp_post'];
  var savedPost;
  if (savedPostJson) {
    savedPost = JSON.parse(savedPostJson);
    mem[savedPost.writeTimeStamp] = savedPost;
  } else if (window.webkitIntent) {
    var intent = window.webkitIntent;
    if (intent.type == 'text/uri-list') {
      savedPost = {link: intent.data};
      _gaq.push(['_trackEvent', 'Source', 'webIntent']);
    }
  }
  localStorage.removeItem('_tmp_post');
  setListeners();
  setDragAndDrop();
  addDraftEditBox(savedPost);
  refreshPosts();
  window.setInterval(function() {
    autosave();
  }, 400);
  if (savedPost) {
    uncollapse(true);
  } else {
    collapse(true);
  }
  handleUrlHandoff();
  if (localStorage['_news_0001'] == '1' && localStorage['_news_0002'] != '1') {
    $('#newsBulletin').show();
  }
  (function() {
   var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
   ga.src = 'https://ssl.google-analytics.com/ga.js';
   var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();
}

document.addEventListener("DOMContentLoaded", function() {
  onLoad();
  if (navigator.userAgent.match('Windows')) {
    document.body.className = document.body.className + ' windows';
  }
});
