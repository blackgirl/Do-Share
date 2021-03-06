/**
 * We're adding one private and two public methods to the
 * BrowserActionController prototype, which allow us to draw
 * rounded rectangles.
 *
 * @author Martin Matysiak (kaktus621@gmail.com)
 * @author Mohamed Mansour (http://mohamedmansour.com)
 *
 * Modified by Tzafrir Rehan to fit Do Share's purposes.
 */

BrowserActionController = function() {
  chrome.browserAction.setBadgeText({ text: '' });
  this.drawBadgeIcon(-1);
  chrome.browserAction.setTitle({title: 'Initializing Do Share'});
};

/**
 * Draws a textual icon on the browser action next to the extension toolbar.
 *
 * @param {number} count The number to draw.
 * @param {string} text The text to show.
 * @param {boolean} altBackground Should an alternative background color be used.
 */
BrowserActionController.prototype.drawBadgeIcon = function(count, text, altBackground) {
  var BACKGROUND = '#eeb443';
  var ALT_BACKGROUND = '#ed7c40';

  var ctx = document.createElement('canvas').getContext('2d');

  ctx.fillStyle = altBackground ? ALT_BACKGROUND : BACKGROUND;
  ctx.strokeStyle = 'rgba(43, 108, 212, 0.5)';
  
  ctx.fillRoundRect(0, 0, 19, 19, 7);
 
  ctx.font = 'bold 11px arial, sans-serif';
  ctx.fillStyle = '#fff';

  var browserActionText = text || '';
  if (count > 99){
    ctx.fillText('99+', 1, 14);
  }
  else if (count > 9){
    ctx.fillText(count + '', 4, 14);
  }
  else if (count >= 0) {
    ctx.fillText(count + '', 7, 14);
  }
  else {
    // TODO error icon
    ctx.fillText('?', 6, 14);
    browserActionText = 'Your session to Google+ was not found, please log in or reopen Chrome.';
  }

  chrome.browserAction.setTitle({title: browserActionText});
  chrome.browserAction.setIcon({imageData: ctx.getImageData(0,0,19,19)});
};

/**
 * Private method which creates the desired shape _without_ actually drawing it
 * (by using fill() or stroke()). This method can be used internally to avoid
 * duplicate code.
 *
 * @param {number} x The x-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} y The y-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} width The desired rectangle's width.
 * @param {number} height The desired rectangle's height.
 * @param {number} radius The radius with which the corners should be rounded.
 */
CanvasRenderingContext2D.prototype._createRoundRect = function(x, y, width, height, radius) {
  this.beginPath();
  // We start in the upper left corner of the shape and draw clockwise
  this.moveTo(x + radius, y);
  this.lineTo(x + width - radius, y);
  this.quadraticCurveTo(x + width, y, x + width, y + radius);
  this.lineTo(x + width, y + height - radius);
  this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  this.lineTo(x + radius, y + height);
  this.quadraticCurveTo(x, y + height, x, y + height - radius);
  this.lineTo(x, y + radius);
  this.quadraticCurveTo(x, y, x + radius, y);
};

/**
 * Draws a filled rounded rectangle at (x, y) position whose size is determined
 * by width and height. Additionally, the corners are rounded by radius.
 *
 * @param {number} x The x-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} y The y-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} width The desired rectangle's width.
 * @param {number} height The desired rectangle's height.
 * @param {number} radius The radius with which the corners should be rounded.
 */
CanvasRenderingContext2D.prototype.fillRoundRect = function(x, y, width, height, radius) {
  this._createRoundRect(x, y, width, height, radius);
  this.fill();
};


/**
 * Paints a rounded rectangle at (x, y) whose size is determined by width and
 * height using the current strokeStyle. The corners are rounded by radius.
 *
 * @param {number} x The x-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} y The y-coordinate of the upper left corner of the
 * desired rounded rectangle.
 * @param {number} width The desired rectangle's width.
 * @param {number} height The desired rectangle's height.
 * @param {number} radius The radius with which the corners should be rounded.
 */
CanvasRenderingContext2D.prototype.strokeRoundRect = function(x, y, width, height, radius) {
  this._createRoundRect(x, y, width, height, radius);
  this.stroke();
};
