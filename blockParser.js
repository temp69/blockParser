var fs = require('fs');
const crypto = require('crypto');
const sha_256 = require("js-sha256");
const MAGIC = '5b3eadcc'; //magnet (old one)

function bufferReader(buffer) {
	var index = 0;
	return {
		read: function read(bytes, ahead) {
			if (index + bytes > buffer.length) {
				return null;
			}
			var result = buffer.slice(index, index + bytes);
			if (ahead == 1) {
				index += bytes;
			}
			return result;
		}
	}
}

function readVarInt(stream) {
	// returns amount of bytes the varInt occupies in the blockchain
	var firstByte = stream.slice(0,1);
	var decimalFirstByte = firstByte.readUInt8(0);

	//console.log('readVarInt', stream, firstByte, decimalFirstByte);

	if (decimalFirstByte < 253) return 1;
	if (decimalFirstByte == 253) return 2;
	if (decimalFirstByte == 254) return 4;
	if (decimalFirstByte == 255) return 8;

	return -1;
}

function toInt(stream) {
	if (!stream) return -1;

	switch(readVarInt(stream)) {
		case 1: return stream.readUInt8(0);
		case 2: return stream.readUInt32LE(1, 2);
		case 4: return stream.readUInt32LE(1, 4);
		case 8: return stream.readUInt32LE(1, 8);
	}

	return -1;
}

function sha256(buffer) {
	return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseBlockData(blockData, blockSize) {
	// ++++ BLOCKHEADER ++++
	var blockHeader = blockData.slice(0,80); // 80 bytes blockheader
	var blockHash = sha256(Buffer.from(sha256(blockHeader), 'hex'));
	// log
	console.log('-BLOCKHEADER	:', blockHeader, blockHeader.length);
	console.log('-- HASH		:', blockHash);
	// parse BlockHeader
	var blockVersion = blockHeader.slice(0, 4); // block version number, 4 bytes
	// TEST START
	if (blockVersion.toString('hex') == MAGIC) {
		console.log("XXX");
		process.exit(1);
	}
	// TEST END
	var blockHashPrevBlock = blockHeader.slice(4, 36); // previous block hash, 32 bytes
	var blockHashMerkleRoot = blockHeader.slice(36, 68); // merkle root hash, 32 bytes
	var blockCurrentTimeStamp = blockHeader.slice(68, 72); // time, 4 bytes
	var blockBits = blockHeader.slice(72, 76); // bits, 4 bytes
	var blockNounce = blockHeader.slice(76); // nounce, 4 bytes
	// log
	console.log('-- VERSION	:', blockVersion, blockVersion.length);
	console.log('-- PREV		:', blockHashPrevBlock, blockHashPrevBlock.toString('hex'), blockHashPrevBlock.length);
	console.log('-- ROOT		:', blockHashMerkleRoot, blockHashMerkleRoot.toString('hex'), blockHashMerkleRoot.length);
	console.log('-- TIME		:', blockCurrentTimeStamp, blockCurrentTimeStamp.readUInt32LE(0, 4), blockCurrentTimeStamp.length);
	console.log('-- BITS		:', blockBits, blockBits.length);
	console.log('-- NOUNCE	:', blockNounce, blockNounce.readUInt32LE(0, 4), blockNounce.length);

	// #### BLOCKCONTENT ####
	var blockContent = blockData.slice(80); // blockcontent from byte 81 -> end of blockData
	console.log('-BLOCKCONTENT	:', blockContent, blockContent.length);
	// parse BlockContent
	var txByteCounter = readVarInt(blockContent.slice(0, 9)); // txByteCounter, varInt with max 9 bytes until txContent is delivered
	var txDecimalCounter = toInt(blockContent.slice(0, 9)); // shows amount of all transactions
	var transactions = blockContent.slice(txByteCounter); // all transaction data
	// log
	console.log('-- TX_COUNT_ALL	:', blockContent.slice(0, 9), txByteCounter, txDecimalCounter);
	console.log('-- TXCONTENT	:', transactions);

	// #### TXCONTENT ####
	// parse transactions
	var txVersion = transactions.slice(0, 4); // transaction version number, 4 bytes
	var txInByteCounter = readVarInt(transactions.slice(4, 13));
	var txInDecimalCounter = toInt(transactions.slice(4, 13));

	var lockTime = transactions.slice(transactions.length-4);
	// log
	console.log('--- TX_VERSION	:', txVersion);
	console.log('--- TX_IN_COUNT	:', transactions.slice(4, 13), txInByteCounter, txInDecimalCounter);
	console.log('--- LOCKTIME	:', lockTime);

	return [blockHash, blockHashPrevBlock.toString('hex')];
}

var data = fs.readFileSync('blk0001.dat');
var reader = bufferReader(data);

/*
//TEST, finding the magicnumbers in the file
var byte = reader.read(1,1);
var byteCounter = 1;
var lastMagic = 0;
var blockSize = 1;
var blockNumber = 1;
while (byte !== null)
{
	if (byte.toString('hex') == '5b') {
		var checkMagic = reader.read(3,0);
		if (checkMagic.toString('hex') == '3eadcc') {
			blockSize = byteCounter - lastMagic;
			console.log('Block[' +blockNumber+ '] found at: '+byteCounter+' last blocksize: '+blockSize+' bytes');
			lastMagic = byteCounter;
			blockNumber++;
		}
	}

	byte = reader.read(1,1);
	byteCounter++;

	if (blockNumber == 4600) process.exit(1);
}
*/

var magic = reader.read(4,1);
var blockSize = reader.read(4,1);
var blockData = reader.read(blockSize.readUInt32LE(0, 4),1);
var currHash = [Buffer.alloc(32).fill(0, 'hex').toString('hex'),"0x0x0"];
var i=0;

while (magic.toString('hex') == MAGIC) {
	var temp = currHash[0];
	console.log('----------------------------------------------------');
	console.log('MAGIC['+i+']	:', magic, magic.toString('hex'));
	console.log('BLOCKSIZE['+i+']	:', blockSize, blockSize.readUInt32LE(0, 4));
	console.log('BLOCKDATA['+i+']	:', blockData);
	console.log(temp);
	
	currHash = parseBlockData(blockData, blockSize.readUInt32LE(0, 4));
	console.log(currHash[0], currHash[1]);
	
	//if (i >= 0 && i <= 10) parseBlockData(blockData, blockSize.readUInt32LE(0, 4));
	//parseBlockData(blockData, blockSize.readUInt32LE(0, 4));

	i++;
	// check prevhash with currentblock prevhash
	if (i> 2 && temp != currHash[1]) {
		console.log('Error found at block: ',i);
		process.exit(1);
	}

	// get next block
	magic = reader.read(4,1);
	blockSize = reader.read(4,1);
	blockData = reader.read(blockSize.readUInt32LE(0, 4),1);
}
