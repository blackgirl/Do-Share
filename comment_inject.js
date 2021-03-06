(function() {

var RESCAN_PERIOD = 500;
var RESCAN_PERIOD_IDLE = 1200;

var foundSomeButtons = true;

var cachedShortcutIcon;
var cachedCount = -1;
var settings;

var selfId;

// Forgive us, gods of programming
var POST_NAME_CLASSNAME = "tv Ub Hf";
var COMMENT_NAME_CLASSNAME = "tv Ub TD";

var COMMENT_CONTENT_CLASSNAME = 'Ct';

var FLAGS_CONTAINER_CLASSNAME = 'wp DI';

var REPLY_BUTTON_CLASSNAME = 'd-s Kv dR';

// Major DRY violation here...
var PROFILE_NAME_SELECTOR = "." + POST_NAME_CLASSNAME.replace(/ /g, ".") + ", ." + COMMENT_NAME_CLASSNAME.replace(/ /g, ".");
var POST_NAME_SELECTOR = "." + POST_NAME_CLASSNAME.replace(/ /g, ".");

var PLUSONE_SELECTOR = "button.esw.Ae";

function extractProfile(profile) {
    return {profileId: profile.getAttribute('oid'),
             realName: profile.textContent};
}

function clickListener(e) {
  var content = decodeURIComponent(this.getAttribute('data-content'));
  var profileDetails = JSON.parse(decodeURIComponent(this.getAttribute('data-profileDetails')));
  e.stopPropagation();
  var mentioned = {};
  mentioned[profileDetails.profileId] = profileDetails.realName;
  chrome.extension.sendRequest({type: 'resharePost',
      htmlContent: formatCommentPost(content, profileDetails.profileId),
      mentioned: mentioned,
      url: getPostUrl(this)});
}

function addClickListener(button, profileDetails, content) {
  button.setAttribute('data-content', encodeURIComponent(content));
  button.setAttribute('data-profileDetails', encodeURIComponent(JSON.stringify(profileDetails)));
  button.addEventListener("click", clickListener, false);
}

function getPostUrl(button) {
  var n = button;
  while (!(n.id && n.id.match(/^update/))) {
    n = n.parentElement;
  }
  return n.querySelector('[target=_blank]').href;
}

function formatCommentPost(content, profileId) {
  content = content.replace(/class="proflink(|Prefix|Wrapper)"/g, '');
  var $ = '<i>A comment ';
  if (profileId == selfId) {
    $ += 'I ';
  } else {
    $ += ('@' + profileId + ' ');
  }
  $ += ('wrote on ${DS_POST_IDENTIFIER}:</i><br><br>' + content);
  return $;
}

function getCommentContent(element) {
  while (!(element.id && element.id.match(/.+#[0-9]+/))) {
    element = element.parentElement;
  }
  var content = element.querySelector('.' + COMMENT_CONTENT_CLASSNAME);
  return content && content.innerHTML;
}

function getPostOwnerUrl(button) {
  var parent = button.parentElement;
  while (parent != null) {
    var postOwnerNode = parent.querySelector(POST_NAME_SELECTOR);
    if (postOwnerNode) {
      return postOwnerNode.href;
    }
    parent = parent.parentElement;
  }
}

function displayFirstWhenSecondIsHovered(first, second) {
  second.addEventListener('mouseover', function(event) {
    first.style.display = "";
  });
  second.addEventListener('mouseout', function(event) {
    first.style.display = "none";
  });
}

function processFooters(first) {
  var ATTRIBUTE = 'doshare_comment';

  if (!selfId) {
    chrome.extension.sendRequest({type: 'getId'}, function(result) {
      if (result.id) {
        selfId = result.id;
      }
    });
    window.setTimeout(processFooters, RESCAN_PERIOD);
    return;
  }

  var buttons = document.body ? document.body.querySelectorAll(PLUSONE_SELECTOR + ':not([' + ATTRIBUTE + '])') : [];

  var oid = selfId;

  if (!buttons || buttons.length == 0) {
    // Less aggressive if idle
    window.setTimeout(processFooters, foundSomeButtons ? RESCAN_PERIOD : RESCAN_PERIOD_IDLE);
    foundSomeButtons = false;
    return;
  }

  foundSomeButtons = true;

  for (var i = 0; i < buttons.length; i++) {
    var button = buttons[i];
    button.setAttribute(ATTRIBUTE, 1);

    // Try to figure out what the author's name is
    var parent = button.parentElement;
    var profile;
    while (parent != null) {
      var profileLink = parent.querySelector(PROFILE_NAME_SELECTOR);
      if (profileLink) {
        profile = extractProfile(profileLink);
        break;
      }
      parent = parent.parentElement;
    }

    if (!profile) {
      continue;
    }

    var newButton = document.createElement('a');
    newButton.setAttribute('role', 'button');
    newButton.style.display = 'none';
    newButton.style.marginLeft = '10px';
    newButton.style.color = '#999';
    newButton.textContent = 'Share';
    newButton.setAttribute('share', 1);

    var p = button.parentElement.parentElement.parentElement;
    var replyChild;
    for (var j = 0; j < p.children.length; ++j) {
      var child = p.children[j];
      if (child.getAttribute('role') == 'button' && child.className == REPLY_BUTTON_CLASSNAME) {
        replyChild = child;
        break;
      }
      if (child.className == FLAGS_CONTAINER_CLASSNAME) {
        replyChild = child;
        break;
      }
    }
    p.insertBefore(newButton, replyChild);

    addClickListener(newButton, profile, getCommentContent(button.parentElement));
    displayFirstWhenSecondIsHovered(newButton, parent.parentElement.parentElement);
  }
  window.setTimeout(processFooters, RESCAN_PERIOD);
}

function onLoad() {
  processFooters();
}

document.addEventListener("DOMContentLoaded", onLoad);

})();
