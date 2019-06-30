var zoomLevel = "";
var url = "https://overpass-api.de/api/interpreter";
var colorcode = {"yes": "color-green", "no": "color-red", "room": "color-green", "bench": "color-green", undefined: "color-grey", "limited": "color-yellow"};
// 'undefined' is equal to 'tag does not exist'. In JS, 'undefined' is also a value
// '*' is a placeholder for notes from mappers and any other value (even 'undefined')
var babyData = {"diaper": {"nameInherit": true, "applyfor": {"activity": true, "childcare": true, "eat": true, "shop": true}, "values": ["yes", "no", "room", "bench", undefined, "*"],											// diaper=yes|no|room|bench|undefined
					"children": {"female": {"values": ["yes", "no", undefined]},		//		diaper:female=yes|no|undefined
								"male": {"values": ["yes", "no", undefined]},			//		diaper:male=yes|no|undefined
								"unisex": {"values": ["yes", "no", undefined]},			//		diaper:unisex=yes|no|undefined
								"fee": {"values": ["yes", "no", undefined]},			//		diaper:fee=yes|no|undefined
								"description": {"values": [undefined, "*"]}				//		diaper:description=undefined|* (implicit specification)
								}
							},
				"changing_table": {"nameInherit": true, "applyfor": {"activity": true, "childcare": true, "eat": true, "shop": true}, "triggers": function(data, local) {if (local.title == getText().PDV_CHANGINGTABLE_UNKNOWN && data["diaper"] != getText().PDV_DIAPER_UNKNOWN){delete data["changing_table"];}if(data["diaper"] == getText().PDV_DIAPER_UNKNOWN && local.title != getText().PDV_CHANGINGTABLE_UNKNOWN){delete data["diaper"];};return data;}, "values": ["yes", "no", "limited", undefined, "*"],		//changing_table=yes|no|limited|undefined
					"children": {"fee": {"values": ["yes", "no", undefined]},	//changing_table:fee=yes|no|undefined
								"location": {"values": ["wheelchair_toilet", "female_toilet", "male_toilet", "unisex_toilet", "dedicated_room", "room", "sales_area", undefined]},	//changing_table:location=wheelchair_toilet|female_toilet|male_toilet|unisex_toilet|dedicated_room|room|sales_area|undefined
								"description": {"values": [undefined, "*"]}	//changing_table:description=undefined|* (implicit specification)
								}
							},
				"highchair": {"nameInherit": true, "applyfor": {"eat": true}, "values": ["yes", "no", undefined, "*"]},					// highchair=yes|no|undefined|*
				"stroller": {"nameInherit": true, "applyfor": {"activity": true, "childcare": true, "eat": true, "shop": true, "health": true}, "values": ["yes", "limited", "no", undefined],									// stroller=yes|limited|no|undefined
					"children": {"description": {"values" : [undefined, "*"]}}			//		stroller:description=undefined|* (implicit specification) (implicit specification)
							},
				"kids_area": {"nameInherit": true, "applyfor": {"activity": true, "childcare": true, "eat": true, "shop": true}, "values": ["yes", "no", undefined],																// kids_area=yes|no|undefined
					"children": {"indoor" :  {"values": ["yes", "no", undefined]},		//		kids_area:indoor=yes|no|undefined
								"outdoor": {"values": ["yes", "no", undefined]},		//		kids_area:outdoor=yes|no|undefined
								"supervised": {"values": ["yes", "no", undefined]},		//		kids_area:supervised=yes|no|undefined
								"fee": {"values": ["yes", "no", undefined]}				//		kids_area:fee=yes|no|undefined
								}
							},
				"baby_feeding": {"nameInherit": true, "applyfor": {"activity": true, "childcare": true, "eat": true, "shop": true, "health": true}, "values": ["yes", "no", "room", undefined],							// baby_feeding=yes|no|room|undefined
					"children": {"female" : {"values": ["yes", "no", undefined]},		//		baby_feeding:female=yes|no|undefined
								"male" : {"values": ["yes", "no", undefined]}			//		baby_feeding:male=yes|no|undefined
								}
							}
				};
var ratingRules = {"max": 23, "green": {"default": 12, "color": "rating-green"}, "red": {"default": 18, "color": "rating-red"}};
var ratingData = {"diaper": {"multiplicator": 4,	// diaper=* 4
						"values" :
							{"yes": 2,				//     yes 2
							"no": 2}				//     no  2
						},
				"changing_table": {"multiplicator": 4,	// changing_table=* 4
						"values" :
							{"yes": 2,				//     yes 2
							"no": 2}				//     no  2
							},
				"highchair": {"multiplicator": 4,	// highchair=* 4  (POIs where you can get meal or something simliar)
						"values" :
							{"yes": 2,				//     yes 2
							"no": 2}				//     no  2
						},
				"kids_area": {"multiplicator": 2,	// kids_area=* 2
						"values" :
							{"yes": 2,				//     yes 2
							"no": 2}				//     no  2
						},
				"stroller": {"multiplicator": 1,	// stroller=* 1
						"values" :
							{"yes": 2,				//     yes 3
							"no": 2,				//     no  3
							"limited": 1}			//     limited 1 (green)
						}
			};
function locationFound(e) {
	//Fires the notification that Babykarte shows the location of the user.
	showGlobalPopup(getText().LOCATING_SUCCESS);
	progressbar();
}
function locationError(e) {
	//Fires the notification that Babykarte shows NOT the location of the user, because it has no permission to do so.
	showGlobalPopup(getText().LOCATING_FAILURE);
	progressbar();
}
function checkboxes2overpass(bounds, actFilter) {
	if (!bounds) {
		bounds = map.getBounds().getSouth() + ',' + map.getBounds().getWest() + ',' + map.getBounds().getNorth() + ',' + map.getBounds().getEast();
	}
	if (!actFilter) {
		actFilter = activeFilter;
	}
	var andquery = "(";
	for (var id in actFilter) {
		for (var value in filter[id].query) {
			var content = filter[id].query[value];
			var name = value.trim();
			name = value.split("|");
			for (var type in name) {
				andquery += name[type].replace(RegExp("_", "g"), "");
				for (var i in content) {
					andquery += content[i];
				}
				andquery += "(" + bounds + ");"
			}
		}
	}
	return andquery + ");";
}
function locateNewArea(fltr, maxNorth, maxSouth, maxWest, maxEast) {
	//Complex algorithm. It calculates the coordinates when the user moves the map. Then the coordinates will be used to fetch just more POIs without overwriting/overlaying the existing ones.
	//NORTH: Number increases when moving to the top (North)
	//SOUTH: Number decreases when moving to the bottom (South)
	//WEST: Number decreases when moving to the left (West)
	//EAST: Number increases when moving to the right (East)
	var accuracy = 0.001;
	var clear = 0;
	var loadingAllowed = false;
	var south_new = map.getBounds().getSouth();
	var west_new = map.getBounds().getWest();
	var north_new = map.getBounds().getNorth();
	var east_new = map.getBounds().getEast();
	var north_old = filter[fltr].coordinates.current.north;
	var east_old = filter[fltr].coordinates.current.east;
	var south_old = filter[fltr].coordinates.current.south;
	var west_old = filter[fltr].coordinates.current.west;
	if (north_new - north_old >= accuracy && west_old - west_new >= accuracy) {
		south_new = north_old;
		east_new = west_old;
		if (north_new > maxNorth && maxWest > west_new) {
			loadingAllowed = true;
			maxNorth = north_new;
			maxWest = west_new;
		}
	} else if (north_new - north_old >= accuracy) {
		south_new = north_old;
		if (north_new > maxNorth) {
			loadingAllowed = true;
			south_new = maxNorth;
			maxNorth = north_new;
			
		}
	} else if (north_new - north_old >= accuracy && east_new - east_old >= accuracy) {
		south_new = north_old;
		west_new = east_old;
		if (north_new > maxNorth && east_new > maxEast) {
			loadingAllowed = true;
			clear = 1;
			maxNorth = north_new;
			maxEast = east_new;
		}
	} else if (east_new - east_old >= accuracy) {
		west_new = east_old;
		if (east_new > maxEast) {
			loadingAllowed = true;
			west_new = maxEast;
			maxEast = east_new;
		}
	} else if (east_new - east_old >= accuracy && south_old - south_new >= accuracy) {
		west_new = east_old;
		north_new = south_old;
		if (east_new > maxEast && maxSouth > south_new) {
			loadingAllowed = true;
			clear = 1;
			maxEast = east_new;
			maxSouth = south_new;
		}
	} else if (south_old - south_new >= accuracy) {
		north_new = south_old;
		if (maxSouth > south_new) {
			loadingAllowed = true;
			north_new = maxSouth;
			maxSouth = south_new;
		}
	} else if (south_old - south_new >= accuracy && west_old - west_new >= accuracy) {
		north_new = south_old;
		east_new = west_old;
		if (maxSouth > south_new && maxWest > west_new) {
			loadingAllowed = true;
			clear = 1;
			maxSouth = south_new;
			maxWest = west_new;
		}
	} else if (west_old - west_new >= accuracy) {
		east_new = west_old;
		if (maxWest > west_new) {
			loadingAllowed = true;
			east_new = maxWest;
			maxWest = west_new;
		}
	}
	setCoordinatesOfFilter(fltr, {"south": south_new, "west": west_new, "north": north_new, "east": east_new}, ["current"]);
	if (loadingAllowed) {
		var dict = {};
		dict[fltr] = true;
		setCoordinatesOfFilter(fltr, {"south": maxSouth, "west": maxWest, "north": maxNorth, "east": maxEast}, ["max"]);
		if (south_new == 0) {
			south_new = map.getBounds().getSouth();
		}
		return checkboxes2overpass(String(south_new) + "," + String(west_new) + "," + String(north_new) + "," + String(east_new), dict);
	}
	return false;
}
function setCoordinatesOfFilter(fltr, values, entries=["current", "max"]) {
	for (var value in values) {
		for (var i in entries) {
			filter[fltr].coordinates[entries[i]][value] = values[value];
		}
	}
}
function resetFilter(fltr) {
	var values = {"south": 0, "west": 0, "north": 0, "east": 0}
	toggleLayers(fltr, 0);
	filter[fltr].usedBefore = true;
	setCoordinatesOfFilter(fltr, values);
	filter[fltr].layers = [];
}
function locateNewAreaBasedOnFilter() {
	//Wrapper around locateNewArea().
	//Adds filter compactibility to locateNewArea() function.
	var values = {"south": map.getBounds().getSouth(), "west": map.getBounds().getWest(), "north": map.getBounds().getNorth(), "east": map.getBounds().getEast()};
	var url = "";
	var result = "";
	for (var fltr in activeFilter) {
		result = locateNewArea(fltr, filter[fltr].coordinates.max.north, filter[fltr].coordinates.max.south, filter[fltr].coordinates.max.west, filter[fltr].coordinates.max.east);
		if (!filter[fltr].usedBefore) {
			filter[fltr].usedBefore = true;
			setCoordinatesOfFilter(fltr, values);
		}
		if (result) {
			url += result
		}
		url = url.replace(");(", "") //Removes the delimiter between Overpass union syntax, because we want to have just one 'union' tag. Combines two (or more 'union's (we're in a loop)) into one.
		fltr++;
	}
	return url
}
function onMapMove() {
	loadPOIS("", locateNewAreaBasedOnFilter());
}
function onMapZoom() {
	var newZoomLevel = String(map.getZoom());
	if (zoomLevel > newZoomLevel) {
		//zoom out
		for (var fltr in activeFilter) {
			resetFilter(fltr);
		}
	}
}
function parseOpening_hours(value) {
	if (!value) {
		return value;
	}
	//Parsing opening hours syntax of OSM.
	// var toTranslate = {"<OSM expression>": "<human expression, will be shown to user instead of <OSM expression>>", ...}
	var toTranslate = getText().opening_hours;
	var syntaxToHTML = {"; " : "<br/>", ";" : "<br/>",  "," : ", ", "-" : " - "}
	//Translates by replacing <OSM expression>'s with the respective <human expression>'s.
	for (var item in toTranslate) {
		value = value.replace(new RegExp(item, "g"), "<b>" + toTranslate[item] + "</b>");
	}
	//Do some translating of special command chars into HTML code or beautiful looking human speech.
	for (var item in syntaxToHTML) {
		value = value.replace(new RegExp(item, "g"), "<b>" + syntaxToHTML[item] + "</b>");
	}
   	return value
}
function addrTrigger_intern(poi, marker) {
	if (marker.popupContent.indexOf("%data_address%") > -1) {
		$.get("https://nominatim.openstreetmap.org/reverse?accept-language=" + languageOfUser + "&format=json&osm_type=" + String(poi.type)[0].toUpperCase() + "&osm_id=" + String(poi.id), function(data, status, xhr, trash) {
			var address = data["address"];
			if (address) {
				var street = address["road"] || address["pedestrian"] || address["street"] || address["footway"] || address["path"] || address["address26"] || getText().PDV_STREET_UNKNOWN;
				var housenumber = address["housenumber"] || address["house_number"] || getText().PDV_HOUSENUMBER_UNKNOWN;
				var postcode = address["postcode"] || getText().PDV_ZIPCODE_UNKNOWN;
				var city = address["city"] || address["town"] || address["county"] || address["state"] || getText().PDV_COMMUNE_UNKNOWN;
				marker.popupContent = marker.popupContent.replace("%data_address%", street + " " + housenumber + "<br/>" + postcode + " " + city);
			} else {
				marker.popupContent = marker.popupContent.replace("%data_address%", "<i><span style='color:red;'>" + getText().PDV_ADDRESS_UNKNOWN + "</span></i>");
			}
			marker.bindPopup(marker.popupContent);
			marker.openPopup();
		});
	}
}
function addrTrigger(poi, marker) {
	marker.on("click", function() {addrTrigger_intern(poi, marker)});
	return "%data_address%";
}
function toggleTab(bla, id) {
	var tab = document.getElementById(id);
	var icon = document.getElementById("icon" + id);
	if (icon.classList.contains("inactive") == true) {
		return 0;
	}
	if (!bla) {
		tab.setAttribute("active", true);
		return 0;
	}
	var tabs = document.getElementsByClassName("tabcontent");
	var icons = document.getElementsByClassName("pdv-icon");
	for (var item = 0;item < tabs.length;item++) {
		tabs[item].style.display = "none";
		if (bla.id.endsWith(icons[item].id)) {
			icons[item].setAttribute("active", true);
		} else {
			icons[item].removeAttribute("active");
		}
	}
	tab.style.display = "block";
}
function addrTab(poi, prefix , condition, symbol) {
	var result = eval(condition);
	if (result.startsWith("www.") && !prefix.startsWith("mail")) {result = "http://" + result}
	return "<div class='grid-container'><a target='_blank' href='" + prefix  + result + "'><img class='small-icon' src='" + symbol + "' /></a><a target='_blank' href='"+ prefix + result + "'>" + result + "</a></div>\n";
}
function babyTab_intern(marker, poi, tag, values, data, parent) {
	if (!parent) {parent = tag;}
	for (var i in values) {
		var title;
		if (values[i] == "*" || poi.tags[tag] == values[i] || poi.tags[tag] && poi.tags[tag].indexOf(values[i]) > -1) {
			var langcode = tag.replace("_", "").replace(":", "_");
			if (values[i] == undefined) {
				langcode += "_UNKNOWN";
			} else {
				langcode += "_" + values[i].replace("_", "").replace(":", "_");;
			}
			if (babyData[parent].applyfor[marker.address.split(" ")[0]]) {title = getText("PDV_" + langcode.toUpperCase());}
			if (title != undefined) {
				data.title = title;
				data.color = colorcode[values[i]];
				break;
			} else {
				if (tag.endsWith("description") && poi.tags[tag] != undefined) {
					data.title = "\"" + poi.tags[tag] + "\"";
					break;
				} else {
					data.title = "NODISPLAY";
				}
			}
		}
		i += 1;
	}
	return data
}
function babyTab(marker, poi) {
	var data = {};
	var output = "";
	for (var tag in babyData) {
		var values = babyData[tag].values;
		var children = babyData[tag].children;
		data[tag] = {};
		data[tag] = babyTab_intern(marker, poi, tag, values, data[tag]);
		data[tag].children = {};
		for (var child in children) {
			data[tag].children[child] = {};
			data[tag].children[child] = babyTab_intern(marker, poi, tag + ":" + child,  babyData[tag].children[child].values, data[tag].children[child], tag)
			
			if (data[tag].children[child].title == "NODISPLAY") {
				delete data[tag].children[child];
			}
		}
	}
	for (var tag in babyData) {
		if (babyData[tag].triggers) {data = babyData[tag].triggers(data, data[tag]);}
	}
	for (var tag in data) {
		if (Object.keys(data[tag].children).length == 0 || Object.keys(data[tag]).length == 0) {
			output += "<ul><li class='" + data[tag].color + "'>" + data[tag].title + "</li></ul>\n";
		} else {
			output += "<details><summary class='" + data[tag].color + "'>" + data[tag].title + "</summary>\n<div>\n%content</div>\n</details>\n";
			var childrenHTML = "";
			if (data[tag].title != "NODISPLAY") {
				for (var child in data[tag].children) {
					childrenHTML += "<ul><li>" + data[tag].children[child].title + "</li></ul>\n";
				}
			}
			output = output.replace("%content", childrenHTML);
		}
	}
	return output;
}
function ratePOI(marker, poi) {
	var i;
	if (!poi.rating) {poi.rating = {};poi.rating.green = 0;poi.rating.red = 0;}
	if (!filter[marker.fltr].address.startsWith("eat")) {return poi;}
	for (i in ratingData) {
		var value = poi.tags[i];
		if (value == undefined) {
			poi.rating.green += 0;
			poi.rating.red += 0;
		} else {
			var points = ratingData[i].multiplicator * ratingData[i].values[value] || 0;
			poi.rating.green += ((value == "yes" || value == "limited") ? points : 0);
			poi.rating.red += ((value == "no" || value == "limited") ? points : 0);
		}
	}
	return poi;
}
function determineRateColor(poi) {
	var exception = {"yellow": {"default": 6, "color": "rating-yellow"}};
	var i, u;
	var colours = [];
	for (i in ratingRules) {
		if (poi.rating[i]) {
			if (poi.rating[i] >= ratingRules[i].default) {
				colours.push(ratingRules[i]);
			} else if (poi.rating[i] >= exception.yellow.default) {
				colours.push(exception.yellow);
			}
		}
	}
	if (colours.length == 2) {
		return exception.yellow.color;
	} else if (colours.length == 0) {
		return false;
	} else {
		return colours[0].color;
	}
}
function addMarkerIcon(poi, marker) {
	var markerIcon = markerCode;
	var result = determineRateColor(poi);
	if (marker.color != "default") {
		markerIcon = markerIcon.replace("#004387", marker.color);
	}
	if (result) {markerIcon = markerIcon.replace("rating-default", result)}
	var iconObject  = L.divIcon({iconSize: [31, 48], popupAnchor: [4, -32], iconAnchor: [12, 45], className: "leaflet-marker-icon leaflet-zoom-animated leaflet-interactive", html: "<svg style='width:25px;height:41px;'>" + markerIcon + "</svg>"}) //Creates the colourized marker icon
	var markerObject = L.marker([poi.lat, poi.lon], {icon: iconObject}); //Set the right coordinates
	marker = $.extend(true, markerObject, marker); //Adds the colourized marker icon
	filter[marker.fltr].layers.push(marker); //Adds the POI to the filter's layers list.
	return marker;
}
function loadPOIS(e, post) {
	hideFilterListOnMobile();
	progressbar(50);
	//Main function of POI loading.
	//Handles connection to OSM Overpass server and parses the response into beautiful looking details views for each POI
	if (!post) {
		//No data to send was specified, because none of the filter functions called it.
		post = locateNewAreaBasedOnFilter();
		if (!post) {
			progressbar();
			return 0;
		}
	}
	//Connect to OSM server
	post = "[out:json][timeout:15];" + post + "out body center;";
	getData(url, "json", post, undefined, function (osmDataAsJson) {
		//Go throw all elements (ways, relations, nodes) sent by Overpass
		for (var poi in osmDataAsJson.elements) {
			var marker;
			var popupContent = "";
			var popupContent_header = "";
			poi = osmDataAsJson.elements[poi];
			if (!poi.tags) {poi.tags = {};}
			if (poi.center != undefined) {
				poi.lat = poi.center.lat;
				poi.lon = poi.center.lon;
			}
			var classId = String(poi.type)[0].toUpperCase() + String(poi.id);
			//creates a new Marker() Object and groups into the layers given by our filters.
			marker = groupIntoLayers(poi);
			poi = ratePOI(marker, poi);
			marker = addMarkerIcon(poi, marker);
			var details_data = {"home": {"content": `<h1>${ ((poi.tags["name"] == undefined) ? ((poi.tags["amenity"] == "toilets") ? getText().TOILET : getText().PDV_UNNAME) : poi.tags["name"]) }</h1><h2>${  String(marker.name) }</h2><address>${ addrTrigger(poi, marker) }</address>`, "symbol": "/images/home.svg", "title": getText().PDV_TITLE_HOME, "active": true, "default": true},
			"baby": {"content": `${babyTab(marker, poi)}`, "symbol": "/images/baby.svg", "title": getText().PDV_TITLE_BABY, "active": true},
			"opening_hours": {"content": `${ parseOpening_hours(poi.tags["opening_hours"]) || "NODISPLAY" }`, "symbol": "/images/clock.svg", "title": getText().PDV_TITLE_OH, "active": true},
			"contact" : {"content": `${ addrTab(poi, "", "poi.tags['website'] || poi.tags['contact:website'] || 'NODISPLAY'", "/images/www.svg") }${ addrTab(poi, "tel:", "poi.tags['phone'] || poi.tags['contact:phone'] || 'NODISPLAY'", "/images/call.svg") }${ addrTab(poi, "mailto:", "poi.tags['email'] || poi.tags['contact:email'] || 'NODISPLAY'", "/images/email.png") }${ addrTab(poi, "", "((poi.tags['facebook'] != undefined) ? ((poi.tags['facebook'].indexOf('/') > -1) ? poi.tags['facebook'] : ((poi.tags['facebook'] == -1) ? 'https://www.facebook.com/' + poi.tags['facebook'] : undefined)) : ((poi.tags['contact:facebook'] != undefined) ? ((poi.tags['contact:facebook'].indexOf('/') > -1) ? poi.tags['contact:facebook'] : ((poi.tags['contact:facebook'] == -1) ? 'https://www.facebook.com/' + poi.tags['contact:facebook'] : 'NODISPLAY')) : 'NODISPLAY'))", "/images/facebook-logo.svg") }`, "symbol": "/images/contact.svg", "title": getText().PDV_TITLE_CONTACT, "active": true},
			"furtherInfos": {"content": `<b>${ getText().PDV_OPERATOR }:</b><br/> ${ ((poi.tags["operator"]) ? poi.tags["operator"] + "<br/>" : "NODISPLAY") }\n<b>${ getText().PDV_DESCRIPTION }:</b><br/>"${ ((poi.tags["description:" + languageOfUser]) ? getText().PDV_DESCRIPTION + ": " + poi.tags["description:" + languageOfUser] : ((poi.tags["description"]) ? getText().PDV_DESCRIPTION + ": " + poi.tags["description"] : "NODISPLAY")) }"\n<br/><a target='_blank' href='${ "https://www.openstreetmap.org/" + String(poi.type).toLowerCase() + "/" + String(poi.id) }'>${ getText().LNK_OSM_VIEW }</a><br/>\n<a href='${ "geo:" + poi.lat + "," + poi.lon }'>${ getText().LNK_OPEN_WITH }</a>`, "symbol": "/images/moreInfo.svg", "title": getText().PDV_TITLE_MI, "active": true}
			};
			for (var entry in details_data) {
				var tabContent = "";
				var defaultOpen = "";
				var content = details_data[entry].content;
				content = content.split("\n");
				if (details_data[entry].default == true) {
					defaultOpen = "style='display:block;'"
				}
				popupContent += "<div class='tabcontent' id='" + classId + entry + "' " + defaultOpen + ">";
				for (var i in content) {
					var tmp = "";
					var result = "";
					result += content[i];
					if (result.indexOf("NODISPLAY") > -1) {result = "";}
					tabContent += result;
				}
				if (tabContent == "") {
					details_data[entry].active = false;
				} else {
					popupContent += tabContent;
				}
				popupContent += "</div>";
			}
			popupContent_header += "<div style='display:flex;'>";
			for (var entry in details_data) {
				var classList = "pdv-icon active";
				if (!details_data[entry].active) {
					classList = "pdv-icon inactive";
				}
				popupContent_header += "<img class='" + classList + "' id='icon" + classId + entry + "' onclick='toggleTab(this, \"" + classId + entry + "\")' src='" + details_data[entry].symbol + "' alt='" + details_data[entry].title + "' title='" + details_data[entry].title + "' />";
			}
			popupContent_header += "</div>";
			marker.popupContent = popupContent_header + popupContent + "<hr/><a target=\"_blank\" href=\"https://www.openstreetmap.org/edit?" + String(poi.type) + "=" + String(poi.id) + "\">" + getText().LNK_OSM_EDIT + "</a>&nbsp;&nbsp;<a target=\"_blank\" href=\"https://www.openstreetmap.org/note/new#map=17/" + poi.lat + "/" + poi.lon + "&layers=N\">" + getText().LNK_OSM_REPORT + "</a>";;
			marker.bindPopup(marker.popupContent);
			//Add marker to cluster
			map.addLayer(marker);
			if (poi.lat == saved_lat && poi.lon == saved_lon) {
				addrTrigger_intern(poi, marker);
			}
		}
		progressbar();
	}, "POST");
}
function getStateFromHash() {
	var hash = location.hash;
	if (hash != "") {
		hash = hash.replace("#", "").split("&");
		if (String(Number(hash[0])) == "NaN") {
			languageOfUser = hash[0];
			zoomLevel = Number(hash[1]);
			saved_lat = Number(hash[2]);
			saved_lon = Number(hash[3]);
		} else {
			zoomLevel = Number(hash[0]);
			saved_lat = Number(hash[1]);
			saved_lon = Number(hash[2]);
		}
		map.setView([saved_lat, saved_lon], zoomLevel);
	}
}
function requestLocation() {map.locate({setView: true, zoom: zoomLevel});}
//init map
progressbar(30);
var map = L.map('map');
map.setView([saved_lat, saved_lon], 15);
getStateFromHash();
map.on("locationfound", locationFound);
map.on("locationerror", locationError);
map.on("click", function(e) {location.hash = String(map.getZoom()) + "&" + String(e.latlng.lat) + "&" + String(e.latlng.lng);})
map.on("moveend", onMapMove);
map.on("zoomend", onMapZoom);
var Layergroup = new L.LayerGroup();
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  minZoom: 10,
  attribution: 'Map data &copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> contributors</a>, <a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, Map Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
progressbar();
zoomLevel = String(map.getZoom());
loadLang("", languageOfUser);
